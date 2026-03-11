use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use regex::Regex;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

use crate::error::AppError;
use crate::pm3::output_parser::strip_ansi;
use crate::pm3::transport::Pm3Transport;
use crate::pm3::types::OutputLine;

/// Port format validation regex.
/// Accepts COM1+ (Windows), /dev/ttyACM0-99, /dev/ttyUSB0-99 (Linux),
/// /dev/tty.usbmodem* (macOS), and /dev/serial/by-id/* (Linux udev).
static PORT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^(COM[1-9]\d*|/dev/tty(ACM|USB)\d{1,2}|/dev/tty\.usbmodem\w+|/dev/serial/by-id/[\w._-]+)$",
    )
    .expect("bad port regex")
});

/// Default timeout for standard commands (30 seconds).
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Validate a port string against expected patterns.
pub fn validate_port(port: &str) -> Result<(), AppError> {
    if !PORT_RE.is_match(port) {
        return Err(AppError::CommandFailed(format!("Invalid port: {}", port)));
    }
    Ok(())
}

/// Validate a command string — reject shell injection attempts.
pub fn validate_command(cmd: &str) -> Result<(), AppError> {
    if cmd.contains(';') || cmd.contains('\n') || cmd.contains('\r') {
        return Err(AppError::CommandFailed(
            "Invalid characters in command".into(),
        ));
    }
    Ok(())
}

/// Returns the ordered list of Tauri shell scope names to try.
/// Prefers v4.x binary names first for faster lookup.
pub fn pm3_scope_names() -> Vec<&'static str> {
    let mut names = vec!["proxmark3-v4", "proxmark3"];

    if cfg!(target_os = "windows") {
        names.push("proxmark3-win-c");
        names.push("proxmark3-win-progfiles");
    } else if cfg!(target_os = "macos") {
        names.push("proxmark3-mac-local");
        names.push("proxmark3-mac-brew");
    } else {
        names.push("proxmark3-linux-local");
        names.push("proxmark3-linux-usr");
    }

    names
}

// ===========================================================================
// Batch CLI Transport (spawn-per-command, `-f -c` mode)
// ===========================================================================

/// Spawn-per-command transport using `proxmark3 -p PORT -f -c "CMD"`.
/// Each command spawns a new process. This is the legacy approach and
/// serves as a fallback when interactive mode is not available.
pub struct CliTransportBatch {
    app: AppHandle,
    port: String,
    child: Mutex<Option<CommandChild>>,
}

impl CliTransportBatch {
    pub fn new(app: AppHandle, port: String) -> Self {
        Self {
            app,
            port,
            child: Mutex::new(None),
        }
    }

    /// Try the bundled sidecar binary first.
    async fn try_sidecar(&self, cmd: &str) -> Result<String, AppError> {
        let sidecar = self
            .app
            .shell()
            .sidecar("binaries/proxmark3")
            .map_err(|e| AppError::CommandFailed(format!("Sidecar not available: {}", e)))?;

        let output_future = sidecar
            .args(["-p", &self.port, "-f", "-c", cmd])
            .output();

        let output = match timeout(DEFAULT_TIMEOUT, output_future).await {
            Err(_) => {
                return Err(AppError::Timeout(format!(
                    "PM3 command timed out after {}s: {}",
                    DEFAULT_TIMEOUT.as_secs(),
                    cmd
                )));
            }
            Ok(Err(e)) => {
                return Err(AppError::CommandFailed(format!(
                    "Failed to run sidecar: {}",
                    e
                )));
            }
            Ok(Ok(output)) => output,
        };

        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        match code {
            0 => Ok(strip_ansi(&stdout)),
            -5 | 251 => Err(AppError::Timeout(format!(
                "PM3 timed out running: {}",
                cmd
            ))),
            _ => {
                let detail = if stderr.is_empty() {
                    strip_ansi(&stdout)
                } else {
                    strip_ansi(&stderr)
                };
                Err(AppError::CommandFailed(format!(
                    "Exit code {}: {}",
                    code, detail
                )))
            }
        }
    }

    /// Execute a command via scope name lookup.
    async fn execute_via_scope(&self, cmd: &str) -> Result<String, AppError> {
        let scope_names = pm3_scope_names();
        let mut first_spawn_error: Option<AppError> = None;

        for scope_name in &scope_names {
            let output_future = self
                .app
                .shell()
                .command(scope_name)
                .args(["-p", &self.port, "-f", "-c", cmd])
                .output();

            let output = match timeout(DEFAULT_TIMEOUT, output_future).await {
                Err(_) => {
                    return Err(AppError::Timeout(format!(
                        "PM3 command timed out after {}s: {}",
                        DEFAULT_TIMEOUT.as_secs(),
                        cmd
                    )));
                }
                Ok(Err(e)) => {
                    if first_spawn_error.is_none() {
                        first_spawn_error = Some(AppError::CommandFailed(format!(
                            "Failed to spawn proxmark3: {}",
                            e
                        )));
                    }
                    continue;
                }
                Ok(Ok(output)) => output,
            };

            let code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            return match code {
                0 => Ok(strip_ansi(&stdout)),
                -5 | 251 => Err(AppError::Timeout(format!(
                    "PM3 timed out running: {}",
                    cmd
                ))),
                _ => {
                    let detail = if stderr.is_empty() {
                        strip_ansi(&stdout)
                    } else {
                        strip_ansi(&stderr)
                    };
                    Err(AppError::CommandFailed(format!(
                        "Exit code {}: {}",
                        code, detail
                    )))
                }
            };
        }

        Err(first_spawn_error.unwrap_or_else(|| {
            AppError::CommandFailed("Failed to spawn proxmark3: binary not found".into())
        }))
    }

    /// Spawn a PM3 process for streaming (used for long-running commands).
    fn spawn_pm3(
        &self,
        cmd: &str,
    ) -> Result<
        (
            tauri::async_runtime::Receiver<CommandEvent>,
            CommandChild,
        ),
        AppError,
    > {
        let args = ["-p", &self.port, "-f", "-c", cmd];

        // Try sidecar first
        if let Ok(sidecar_cmd) = self.app.shell().sidecar("binaries/proxmark3") {
            if let Ok(result) = sidecar_cmd.args(&args).spawn() {
                return Ok(result);
            }
        }

        // Fall back to scope names
        let scope_names = pm3_scope_names();
        let mut first_err: Option<String> = None;

        for scope_name in &scope_names {
            match self.app.shell().command(scope_name).args(&args).spawn() {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if first_err.is_none() {
                        first_err = Some(format!("{}", e));
                    }
                }
            }
        }

        Err(AppError::CommandFailed(format!(
            "Failed to spawn proxmark3: {}",
            first_err.unwrap_or_else(|| "binary not found".into())
        )))
    }
}

#[async_trait]
impl Pm3Transport for CliTransportBatch {
    async fn send(&self, cmd: &str) -> Result<String, AppError> {
        validate_command(cmd)?;

        // Try sidecar first, then scope names
        match self.try_sidecar(cmd).await {
            Ok(output) => Ok(output),
            Err(_) => self.execute_via_scope(cmd).await,
        }
    }

    async fn send_streaming(
        &self,
        cmd: &str,
        timeout_secs: u64,
        mut on_line: Box<dyn FnMut(OutputLine) + Send>,
    ) -> Result<String, AppError> {
        validate_command(cmd)?;

        let (rx, child) = self.spawn_pm3(cmd)?;

        // Store child for cancellation
        {
            let mut lock = self.child.lock().map_err(|e| {
                AppError::CommandFailed(format!("Transport lock poisoned: {}", e))
            })?;
            *lock = Some(child);
        }

        let result =
            read_stream_with_timeout(rx, timeout_secs, &mut |line| {
                on_line(line);
            })
            .await;

        // Clear child
        {
            let mut lock = self.child.lock().unwrap_or_else(|e| e.into_inner());
            *lock = None;
        }

        result
    }

    async fn is_alive(&self) -> bool {
        // Batch transport is always "alive" — each command is independent
        true
    }

    fn cancel(&self) -> Result<(), AppError> {
        let child = {
            let mut lock = self.child.lock().map_err(|e| {
                AppError::CommandFailed(format!("Transport lock poisoned: {}", e))
            })?;
            lock.take()
        };

        if let Some(child) = child {
            child.kill().map_err(|e| {
                AppError::CommandFailed(format!("Failed to kill PM3 process: {}", e))
            })?;
        }

        Ok(())
    }

    async fn close(&self) -> Result<(), AppError> {
        self.cancel()
    }
}

// ===========================================================================
// Shared helpers
// ===========================================================================

/// Read from a CommandEvent receiver with timeout, calling on_line for each output line.
/// Returns accumulated cleaned output.
async fn read_stream_with_timeout(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    timeout_secs: u64,
    on_line: &mut (dyn FnMut(OutputLine) + Send),
) -> Result<String, AppError> {
    let deadline = Duration::from_secs(timeout_secs);
    let mut accumulated = String::new();
    let mut exit_code: Option<i32> = None;

    loop {
        match timeout(deadline, rx.recv()).await {
            Err(_) => {
                return Err(AppError::Timeout(format!(
                    "PM3 operation timed out after {}s",
                    timeout_secs
                )));
            }
            Ok(None) => break,
            Ok(Some(event)) => match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let cleaned = strip_ansi(&line);
                    let trimmed = cleaned.trim();
                    if !trimmed.is_empty() {
                        on_line(OutputLine {
                            text: trimmed.to_string(),
                            is_error: false,
                        });
                        accumulated.push_str(trimmed);
                        accumulated.push('\n');
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let cleaned = strip_ansi(&line);
                    let trimmed = cleaned.trim();
                    if !trimmed.is_empty() {
                        on_line(OutputLine {
                            text: trimmed.to_string(),
                            is_error: true,
                        });
                        accumulated.push_str(trimmed);
                        accumulated.push('\n');
                    }
                }
                CommandEvent::Error(msg) => {
                    return Err(AppError::CommandFailed(format!(
                        "Process error: {}",
                        msg
                    )));
                }
                CommandEvent::Terminated(payload) => {
                    exit_code = payload.code;
                    break;
                }
                _ => {}
            },
        }
    }

    match exit_code {
        Some(0) | None => Ok(accumulated),
        Some(-5) | Some(251) => Err(AppError::Timeout("PM3 subprocess timed out".into())),
        Some(code) => Err(AppError::CommandFailed(format!(
            "PM3 exited with code {}",
            code
        ))),
    }
}

// ===========================================================================
// Port candidate discovery
// ===========================================================================

/// Build ordered list of candidate serial ports to probe for PM3 devices.
pub fn build_port_candidates() -> Vec<String> {
    let mut ports = Vec::new();

    if cfg!(target_os = "windows") {
        for i in 1..=40 {
            ports.push(format!("COM{}", i));
        }
    } else if cfg!(target_os = "macos") {
        // Dynamic discovery: scan /dev for actual usbmodem devices
        if let Ok(entries) = std::fs::read_dir("/dev") {
            let mut found: Vec<String> = entries
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with("tty.usbmodem") {
                        Some(format!("/dev/{}", name))
                    } else {
                        None
                    }
                })
                .collect();
            found.sort();
            ports.extend(found);
        }
        // Static fallback in case /dev scan missed anything
        for suffix in &[
            "iceman1", "14101", "14201", "14301", "1", "2", "3",
        ] {
            let p = format!("/dev/tty.usbmodem{}", suffix);
            if !ports.contains(&p) {
                ports.push(p);
            }
        }
    } else {
        // Linux: dynamic discovery first, then static fallback
        // Check /dev/serial/by-id/ for symlinks to actual devices
        if let Ok(entries) = std::fs::read_dir("/dev/serial/by-id/") {
            for entry in entries.flatten() {
                if let Ok(target) = std::fs::read_link(entry.path()) {
                    let resolved = entry
                        .path()
                        .parent()
                        .unwrap_or(std::path::Path::new("/dev/serial/by-id"))
                        .join(&target);
                    if let Ok(canonical) = std::fs::canonicalize(resolved) {
                        if let Some(path_str) = canonical.to_str() {
                            if !ports.contains(&path_str.to_string()) {
                                ports.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        // Static fallback
        for i in 0..=9 {
            let acm = format!("/dev/ttyACM{}", i);
            if !ports.contains(&acm) {
                ports.push(acm);
            }
            let usb = format!("/dev/ttyUSB{}", i);
            if !ports.contains(&usb) {
                ports.push(usb);
            }
        }
    }

    ports
}
