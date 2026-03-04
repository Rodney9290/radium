use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

use crate::error::AppError;
use crate::pm3::connection::emit_output;
use crate::pm3::output_parser::strip_ansi;
use crate::pm3::transport_cli::{build_port_candidates, validate_port};
use crate::pm3::version::parse_detailed_hw_version;

/// Result of scanning for a PM3 device.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    pub port: String,
    pub model: String,
    pub firmware: String,
    pub hardware_variant: String,
    pub hw_version_output: String,
}

/// Scan common serial ports trying `hw version` to find a connected PM3.
/// Returns the first responsive device found.
///
/// This probes by spawning short-lived `proxmark3 -p PORT -f -c "hw version"`
/// processes. Once a device is found, the session manager will establish
/// a persistent connection.
pub async fn find_device(app: &AppHandle) -> Result<DiscoveredDevice, AppError> {
    let candidates = build_port_candidates();

    // Personality messages
    let init_msgs = [
        "[=] Scanning for Proxmark3 devices...",
        "[=] Probing serial ports...",
        "[=] Looking for hardware...",
    ];
    let idx = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as usize
        % init_msgs.len();
    emit_output(app, init_msgs[idx], false);

    for port in &candidates {
        emit_output(app, &format!("[=] Trying {}...", port), false);

        match probe_port(app, port).await {
            Ok(device) => {
                emit_output(
                    app,
                    &format!("[+] Found: {} on {}", device.model, port),
                    false,
                );
                emit_output(
                    app,
                    &format!("[+] Firmware: {}", device.firmware),
                    false,
                );
                return Ok(device);
            }
            Err(e) => {
                let err_msg = e.to_string();

                // Capabilities mismatch = device present but firmware mismatched
                if err_msg.to_lowercase().contains("capabilities") {
                    emit_output(
                        app,
                        &format!("[+] Found: Proxmark3 on {} (firmware mismatch)", port),
                        false,
                    );
                    return Ok(DiscoveredDevice {
                        port: port.clone(),
                        model: "Proxmark3".to_string(),
                        firmware: "mismatched".to_string(),
                        hardware_variant: "generic".to_string(),
                        hw_version_output: String::new(),
                    });
                }

                // Binary not found = affects all ports, fail fast
                if err_msg.contains("Failed to spawn proxmark3") {
                    emit_output(
                        app,
                        "[!!] Proxmark3 binary not found. Check installation.",
                        true,
                    );
                    return Err(e);
                }

                emit_output(app, &format!("[-] {} -- no response", port), false);
            }
        }
    }

    emit_output(app, "[!!] No Proxmark3 found.", true);
    emit_output(
        app,
        "[=] Try a different USB cable (some are charge-only)",
        false,
    );
    Err(AppError::DeviceNotFound)
}

/// Probe a single port by running `hw version`.
async fn probe_port(app: &AppHandle, port: &str) -> Result<DiscoveredDevice, AppError> {
    if validate_port(port).is_err() {
        return Err(AppError::CommandFailed(format!("Invalid port: {}", port)));
    }

    let pm3_timeout = std::time::Duration::from_secs(10);
    let cmd = "hw version";

    // Try sidecar first
    if let Ok(sidecar) = app.shell().sidecar("binaries/proxmark3") {
        if let Ok(Ok(output)) = timeout(
            pm3_timeout,
            sidecar.args(["-p", port, "-f", "-c", cmd]).output(),
        )
        .await
        {
            if output.status.code() == Some(0) {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let cleaned = strip_ansi(&stdout);
                if let Some(device) = parse_probe_output(port, &cleaned) {
                    return Ok(device);
                }
            }
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.to_lowercase().contains("capabilities") {
                return Err(AppError::CommandFailed("capabilities mismatch".into()));
            }
        }
    }

    // Try scope names
    let scope_names = vec!["proxmark3"];
    let extended: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["proxmark3-win-c", "proxmark3-win-progfiles"]
    } else if cfg!(target_os = "macos") {
        vec!["proxmark3-mac-local", "proxmark3-mac-brew"]
    } else {
        vec!["proxmark3-linux-local", "proxmark3-linux-usr"]
    };

    for scope_name in scope_names.iter().chain(extended.iter()) {
        let result = timeout(
            pm3_timeout,
            app.shell()
                .command(scope_name)
                .args(["-p", port, "-f", "-c", cmd])
                .output(),
        )
        .await;

        match result {
            Ok(Ok(output)) => {
                let code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                if code == 0 {
                    let cleaned = strip_ansi(&stdout);
                    if let Some(device) = parse_probe_output(port, &cleaned) {
                        return Ok(device);
                    }
                }

                // Check for capabilities mismatch
                let combined = format!("{} {}", stdout, stderr);
                if combined.to_lowercase().contains("capabilities") {
                    return Err(AppError::CommandFailed("capabilities mismatch".into()));
                }

                // Non-zero exit but binary was found
                if code != 0 {
                    return Err(AppError::CommandFailed(format!(
                        "Exit code {}",
                        code
                    )));
                }
            }
            Ok(Err(_)) => {
                // Spawn failed at this scope name, try next
                continue;
            }
            Err(_) => {
                // Timeout
                return Err(AppError::Timeout("Probe timed out".into()));
            }
        }
    }

    Err(AppError::CommandFailed(
        "Failed to spawn proxmark3: binary not found".into(),
    ))
}

/// Parse `hw version` output into a DiscoveredDevice.
fn parse_probe_output(port: &str, output: &str) -> Option<DiscoveredDevice> {
    let info = parse_detailed_hw_version(output);

    let firmware = if !info.os_version.is_empty() {
        extract_short_version(&info.os_version)
    } else if !info.client_version.is_empty() {
        extract_short_version(&info.client_version)
    } else if output.to_lowercase().contains("proxmark") {
        "unknown".to_string()
    } else {
        return None;
    };

    Some(DiscoveredDevice {
        port: port.to_string(),
        model: info.model,
        firmware,
        hardware_variant: info.hardware_variant,
        hw_version_output: output.to_string(),
    })
}

/// Extract a short version string like "v4.20728" from a full version string.
fn extract_short_version(version_str: &str) -> String {
    let v_pos = version_str.char_indices().find(|&(i, c)| {
        c == 'v'
            && version_str
                .get(i + 1..i + 2)
                .map_or(false, |s| {
                    s.as_bytes()
                        .first()
                        .map_or(false, |b| b.is_ascii_digit())
                })
    });

    if let Some((pos, _)) = v_pos {
        let rest = &version_str[pos..];
        let end = rest
            .find(|c: char| c != 'v' && !c.is_ascii_digit() && c != '.')
            .unwrap_or(rest.len());
        rest[..end].to_string()
    } else {
        version_str.to_string()
    }
}
