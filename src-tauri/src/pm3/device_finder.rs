use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::time::timeout;

use crate::error::AppError;
use crate::pm3::connection::emit_output;
use crate::pm3::output_parser::strip_ansi;
use crate::pm3::transport_cli::{build_port_candidates, pm3_scope_names, validate_port};
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

    // Probe ports sequentially to avoid zombie processes from parallel spawns.
    // With dynamic port discovery we typically have only 1-2 real candidates,
    // so sequential probing is fast enough.
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
                    return handle_capabilities_mismatch(app, port);
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
///
/// Tries batch mode first (`-p PORT -f -c CMD`) which works cleanly with v4.x,
/// then falls back to interactive spawn for old v3.x clients.
async fn probe_port(app: &AppHandle, port: &str) -> Result<DiscoveredDevice, AppError> {
    if validate_port(port).is_err() {
        return Err(AppError::CommandFailed(format!("Invalid port: {}", port)));
    }

    // === Try batch mode first (clean, works with v4.x clients) ===
    let batch_timeout = std::time::Duration::from_secs(10);
    let cmd = "hw version";
    let batch_args = ["-p", port, "-f", "-c", cmd];

    // Sidecar batch
    if let Ok(sidecar) = app.shell().sidecar("binaries/proxmark3") {
        if let Ok(Ok(output)) = timeout(
            batch_timeout,
            sidecar.args(&batch_args).output(),
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

    // Scope-based batch
    let scope_names = pm3_scope_names();
    for scope_name in &scope_names {
        eprintln!("[probe_port] trying scope '{}' with batch args {:?}", scope_name, batch_args);
        match timeout(
            batch_timeout,
            app.shell().command(scope_name).args(&batch_args).output(),
        )
        .await
        {
            Ok(Ok(output)) => {
                let code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                eprintln!("[probe_port] scope '{}' exit={}, stdout_len={}, stderr_len={}", scope_name, code, stdout.len(), stderr.len());
                if !stderr.is_empty() {
                    eprintln!("[probe_port] stderr: {:?}", &stderr[..stderr.len().min(200)]);
                }

                if code == 0 {
                    let cleaned = strip_ansi(&stdout);
                    if let Some(device) = parse_probe_output(port, &cleaned) {
                        return Ok(device);
                    }
                    eprintln!("[probe_port] parse_probe_output returned None for scope '{}'", scope_name);
                }
                let combined = format!("{} {}", stdout, stderr);
                if combined.to_lowercase().contains("capabilities") {
                    return Err(AppError::CommandFailed("capabilities mismatch".into()));
                }
                // Only break if the binary was found (non-zero exit = binary exists but failed)
                if code >= 0 {
                    break;
                }
            }
            Ok(Err(e)) => {
                eprintln!("[probe_port] scope '{}' spawn error: {}", scope_name, e);
            }
            Err(_) => {
                eprintln!("[probe_port] scope '{}' timed out", scope_name);
            }
        }
    }

    // === Fallback: interactive spawn for old v3.x clients ===
    let pm3_timeout = std::time::Duration::from_secs(10);
    if let Some(device) = probe_port_interactive(app, port, pm3_timeout).await {
        return Ok(device);
    }

    Err(AppError::CommandFailed(
        "Failed to spawn proxmark3: binary not found".into(),
    ))
}

/// Probe using interactive spawn: `proxmark3 <port>` with stdin piped commands.
/// Works with old iceman v3.x that doesn't support `-p`/`-c` flags.
async fn probe_port_interactive(
    app: &AppHandle,
    port: &str,
    pm3_timeout: std::time::Duration,
) -> Option<DiscoveredDevice> {
    let args = [port];

    // Try sidecar first, then scope names
    let spawn_result = if let Ok(cmd) = app.shell().sidecar("binaries/proxmark3") {
        cmd.args(&args).spawn().ok()
    } else {
        None
    };

    let (mut rx, mut child) = if let Some(result) = spawn_result {
        result
    } else {
        let scope_names = pm3_scope_names();
        let mut found = None;
        for name in &scope_names {
            match app.shell().command(name).args(&args).spawn() {
                Ok(result) => {
                    found = Some(result);
                    break;
                }
                Err(_) => {}
            }
        }
        match found {
            Some(f) => f,
            None => return None,
        }
    };

    // Write "hw version" to stdin, then collect output
    let _ = child.write("hw version\n".as_bytes());

    let mut collected = String::new();
    let deadline = tokio::time::Instant::now() + pm3_timeout;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match timeout(remaining, rx.recv()).await {
            Ok(Some(event)) => match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    collected.push_str(&text);
                    collected.push('\n');
                    // Once we see the prompt after hw version output, we have enough
                    let cleaned = strip_ansi(&collected);
                    if cleaned.contains("pm3 -->") && cleaned.contains("[ ARM ]") {
                        break;
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    collected.push_str(&text);
                    collected.push('\n');
                }
                CommandEvent::Terminated(_) => break,
                _ => {}
            },
            Ok(None) => break, // channel closed
            Err(_) => break,   // timeout
        }
    }

    // Kill the interactive process
    let _ = child.kill();

    let cleaned = strip_ansi(&collected);
    parse_probe_output(port, &cleaned)
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
