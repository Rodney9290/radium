use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Notify;
use tokio::time::timeout;

use crate::error::AppError;
use crate::pm3::output_parser::strip_ansi;
use crate::pm3::transport::Pm3Transport;
use crate::pm3::transport_cli::{pm3_scope_names, validate_command};
use crate::pm3::types::OutputLine;

/// Default timeout for waiting for the PM3 prompt (30 seconds).
const PROMPT_TIMEOUT: Duration = Duration::from_secs(30);

/// Interactive CLI transport using a persistent `proxmark3 -p PORT` process.
///
/// Instead of spawning a new process per command, this transport keeps a
/// single long-lived PM3 process in interactive mode. Commands are sent via
/// stdin and output is collected until the PM3 prompt reappears.
///
/// This eliminates the serial port open/close cycle that causes disconnects
/// during rapid command sequences.
pub struct CliTransportInteractive {
    /// Handle to the child process for writing stdin.
    child: Mutex<Option<CommandChild>>,
    /// Receiver for stdout/stderr events from the child.
    /// Wrapped in tokio Mutex because recv() is async.
    rx: tokio::sync::Mutex<Option<tauri::async_runtime::Receiver<CommandEvent>>>,
    /// Notifies when a command's output is complete (prompt detected).
    prompt_notify: Notify,
    /// Whether the process is still alive.
    alive: Mutex<bool>,
}

impl CliTransportInteractive {
    /// Spawn a persistent PM3 process in interactive mode.
    ///
    /// Tries the bundled sidecar first, then scope-based lookup.
    /// The process runs `proxmark3 -p PORT` (no `-f -c`), keeping the
    /// serial connection open for the lifetime of the process.
    pub fn spawn(app: &AppHandle, port: &str) -> Result<Self, AppError> {
        let args = ["-p", port];

        // Try sidecar first
        let spawn_result = if let Ok(cmd) = app.shell().sidecar("binaries/proxmark3") {
            cmd.args(&args).spawn().ok()
        } else {
            None
        };

        let (rx, child) = if let Some(result) = spawn_result {
            result
        } else {
            // Fall back to scope names
            let scope_names = pm3_scope_names();
            let mut first_err: Option<String> = None;
            let mut found = None;

            for name in &scope_names {
                match app.shell().command(name).args(&args).spawn() {
                    Ok(result) => {
                        found = Some(result);
                        break;
                    }
                    Err(e) => {
                        if first_err.is_none() {
                            first_err = Some(e.to_string());
                        }
                    }
                }
            }

            found.ok_or_else(|| {
                AppError::CommandFailed(format!(
                    "Failed to spawn PM3 interactive session: {}",
                    first_err.unwrap_or_else(|| "binary not found".into())
                ))
            })?
        };

        Ok(Self {
            child: Mutex::new(Some(child)),
            rx: tokio::sync::Mutex::new(Some(rx)),
            prompt_notify: Notify::new(),
            alive: Mutex::new(true),
        })
    }

    /// Wait for the initial PM3 prompt after spawning.
    /// The PM3 client outputs version info and then shows its prompt.
    pub async fn wait_for_ready(&self) -> Result<String, AppError> {
        self.read_until_prompt(PROMPT_TIMEOUT.as_secs(), &mut |_| {})
            .await
    }

    /// Read output from the PM3 process until a prompt line is detected.
    ///
    /// PM3 prompts look like:
    /// - `pm3 --> ` (default)
    /// - `[usb] pm3 --> ` (connected via USB)
    /// - `[bt] pm3 --> ` (connected via Bluetooth)
    /// - `proxmark3> ` (older firmware)
    async fn read_until_prompt(
        &self,
        timeout_secs: u64,
        on_line: &mut (dyn FnMut(OutputLine) + Send),
    ) -> Result<String, AppError> {
        let mut rx_guard = self.rx.lock().await;
        let rx = rx_guard.as_mut().ok_or_else(|| {
            AppError::CommandFailed("PM3 process not available".into())
        })?;

        let deadline = Duration::from_secs(timeout_secs);
        let mut accumulated = String::new();

        loop {
            match timeout(deadline, rx.recv()).await {
                Err(_) => {
                    return Err(AppError::Timeout(format!(
                        "PM3 prompt not received within {}s",
                        timeout_secs
                    )));
                }
                Ok(None) => {
                    // Channel closed — process exited
                    if let Ok(mut a) = self.alive.lock() {
                        *a = false;
                    }
                    return Err(AppError::CommandFailed(
                        "PM3 process exited unexpectedly".into(),
                    ));
                }
                Ok(Some(event)) => match event {
                    CommandEvent::Stdout(bytes) => {
                        let raw = String::from_utf8_lossy(&bytes);
                        let cleaned = strip_ansi(&raw);

                        // Check each line for the prompt
                        for line in cleaned.lines() {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            if is_pm3_prompt(trimmed) {
                                self.prompt_notify.notify_one();
                                return Ok(accumulated);
                            }

                            on_line(OutputLine {
                                text: trimmed.to_string(),
                                is_error: false,
                            });
                            accumulated.push_str(trimmed);
                            accumulated.push('\n');
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let raw = String::from_utf8_lossy(&bytes);
                        let cleaned = strip_ansi(&raw);
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
                        if let Ok(mut a) = self.alive.lock() {
                            *a = false;
                        }
                        return Err(AppError::CommandFailed(format!(
                            "PM3 process error: {}",
                            msg
                        )));
                    }
                    CommandEvent::Terminated(_) => {
                        if let Ok(mut a) = self.alive.lock() {
                            *a = false;
                        }
                        return Err(AppError::CommandFailed(
                            "PM3 process terminated unexpectedly".into(),
                        ));
                    }
                    _ => {}
                },
            }
        }
    }

    /// Write a command string to the PM3 process stdin.
    fn write_stdin(&self, cmd: &str) -> Result<(), AppError> {
        let mut guard = self.child.lock().map_err(|e| {
            AppError::CommandFailed(format!("Child process lock poisoned: {}", e))
        })?;

        let child = guard.as_mut().ok_or_else(|| {
            AppError::CommandFailed("PM3 process not available".into())
        })?;

        child
            .write(format!("{}\n", cmd).as_bytes())
            .map_err(|e| {
                AppError::CommandFailed(format!("Failed to write to PM3 stdin: {}", e))
            })
    }
}

#[async_trait]
impl Pm3Transport for CliTransportInteractive {
    async fn send(&self, cmd: &str) -> Result<String, AppError> {
        validate_command(cmd)?;
        // Write command to stdin
        self.write_stdin(cmd)?;

        // Read output until the prompt returns
        self.read_until_prompt(PROMPT_TIMEOUT.as_secs(), &mut |_| {})
            .await
    }

    async fn send_streaming(
        &self,
        cmd: &str,
        timeout_secs: u64,
        mut on_line: Box<dyn FnMut(OutputLine) + Send>,
    ) -> Result<String, AppError> {
        validate_command(cmd)?;
        self.write_stdin(cmd)?;

        self.read_until_prompt(timeout_secs, &mut |line| {
            on_line(line);
        })
        .await
    }

    async fn is_alive(&self) -> bool {
        let flag = self.alive.lock().map(|a| *a).unwrap_or(false);
        if !flag {
            return false;
        }
        // Also check that the child process handle still exists
        self.child.lock().map(|c| c.is_some()).unwrap_or(false)
    }

    fn cancel(&self) -> Result<(), AppError> {
        // Kill the child process to cancel the running command.
        // After cancellation, the session should reconnect.
        let mut guard = self.child.lock().map_err(|e| {
            AppError::CommandFailed(format!("Child lock poisoned: {}", e))
        })?;

        if let Some(child) = guard.take() {
            child.kill().map_err(|e| {
                AppError::CommandFailed(format!("Failed to kill PM3 process: {}", e))
            })?;
        }

        if let Ok(mut a) = self.alive.lock() {
            *a = false;
        }

        Ok(())
    }

    async fn close(&self) -> Result<(), AppError> {
        // Try graceful quit first
        if self.alive.lock().map(|a| *a).unwrap_or(false) {
            if self.write_stdin("quit").is_ok() {
                // Give it a moment to exit
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }

        // Force kill if still running
        let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }

        if let Ok(mut a) = self.alive.lock() {
            *a = false;
        }

        Ok(())
    }
}

/// Check if a line is a PM3 interactive prompt.
///
/// Known prompt formats:
/// - `pm3 --> ` (default)
/// - `[usb] pm3 --> ` (USB connection indicator)
/// - `[bt] pm3 --> ` (Bluetooth connection indicator)
/// - `proxmark3> ` (older firmware)
/// - `[usb|script] pm3 --> ` (script mode)
fn is_pm3_prompt(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.ends_with("pm3 -->")
        || trimmed.ends_with("pm3 --> ")
        || trimmed.ends_with("proxmark3>")
        || trimmed.ends_with("proxmark3> ")
}
