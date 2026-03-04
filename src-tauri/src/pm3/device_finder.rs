use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::task::JoinSet;
use tokio::time::timeout;

use crate::error::AppError;
use crate::pm3::connection::emit_output;
use crate::pm3::output_parser::strip_ansi;
use crate::pm3::transport_cli::{build_port_candidates, validate_port};
use crate::pm3::version::parse_detailed_hw_version;

/// Maximum number of concurrent port probes.
const MAX_CONCURRENT_PROBES: usize = 4;

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
/// Probes ports in parallel (up to 4 at a time) for faster discovery.
#[allow(dead_code)]
pub async fn find_device(app: &AppHandle) -> Result<DiscoveredDevice, AppError> {
    find_device_with_hint(app, None).await
}

/// Scan for a PM3 device, optionally trying a hint port first.
///
/// If `hint_port` is provided, it is probed first (fast path for reconnect).
/// If that fails, remaining ports are probed in parallel batches.
pub async fn find_device_with_hint(
    app: &AppHandle,
    hint_port: Option<&str>,
) -> Result<DiscoveredDevice, AppError> {
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

    // Fast path: try hint port first (last known port from previous session)
    if let Some(hint) = hint_port {
        emit_output(app, &format!("[=] Trying last known port {}...", hint), false);
        match probe_port(app, hint).await {
            Ok(device) => {
                emit_output(
                    app,
                    &format!("[+] Found: {} on {}", device.model, hint),
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
                if err_msg.to_lowercase().contains("capabilities") {
                    return handle_capabilities_mismatch(app, hint);
                }
                if err_msg.contains("Failed to spawn proxmark3") {
                    emit_output(
                        app,
                        "[!!] Proxmark3 binary not found. Check installation.",
                        true,
                    );
                    return Err(e);
                }
                emit_output(app, &format!("[-] {} -- no response", hint), false);
            }
        }
    }

    // Build candidate list, excluding the hint port (already tried)
    let candidates: Vec<String> = build_port_candidates()
        .into_iter()
        .filter(|p| hint_port.map_or(true, |h| p != h))
        .collect();

    if candidates.is_empty() {
        emit_output(app, "[!!] No Proxmark3 found.", true);
        return Err(AppError::DeviceNotFound);
    }

    // Probe ports in parallel batches
    for chunk in candidates.chunks(MAX_CONCURRENT_PROBES) {
        // Log which ports we're trying
        for port in chunk {
            emit_output(app, &format!("[=] Trying {}...", port), false);
        }

        let mut join_set = JoinSet::new();

        for port in chunk {
            let app_clone = app.clone();
            let port_owned = port.clone();
            join_set.spawn(async move {
                let result = probe_port(&app_clone, &port_owned).await;
                (port_owned, result)
            });
        }

        // Collect results from this batch
        while let Some(result) = join_set.join_next().await {
            match result {
                Ok((port, Ok(device))) => {
                    // Found a device — abort remaining probes in this batch
                    join_set.abort_all();
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
                Ok((port, Err(e))) => {
                    let err_msg = e.to_string();

                    // Capabilities mismatch = device present but firmware mismatched
                    if err_msg.to_lowercase().contains("capabilities") {
                        join_set.abort_all();
                        return handle_capabilities_mismatch(app, &port);
                    }

                    // Binary not found = affects all ports, fail fast
                    if err_msg.contains("Failed to spawn proxmark3") {
                        join_set.abort_all();
                        emit_output(
                            app,
                            "[!!] Proxmark3 binary not found. Check installation.",
                            true,
                        );
                        return Err(e);
                    }

                    emit_output(app, &format!("[-] {} -- no response", port), false);
                }
                Err(_join_err) => {
                    // Task was cancelled or panicked — skip
                }
            }
        }
    }

    emit_output(app, "[!!] No Proxmark3 found.", true);
    Err(AppError::DeviceNotFound)
}

/// Handle capabilities mismatch: device present but firmware version doesn't match client.
fn handle_capabilities_mismatch(app: &AppHandle, port: &str) -> Result<DiscoveredDevice, AppError> {
    emit_output(
        app,
        &format!("[+] Found: Proxmark3 on {} (firmware mismatch)", port),
        false,
    );
    Ok(DiscoveredDevice {
        port: port.to_string(),
        model: "Proxmark3".to_string(),
        firmware: "mismatched".to_string(),
        hardware_variant: "generic".to_string(),
        hw_version_output: String::new(),
    })
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
