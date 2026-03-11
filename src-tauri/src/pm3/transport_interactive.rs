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
        // Try v4.x `-p PORT` first, then old-style `PORT` as fallback for v3.x.
        let spawn_result = if let Ok(cmd) = app.shell().sidecar("binaries/proxmark3") {
            cmd.args(["-p", port]).spawn().ok()
        } else {
            None
        }.or_else(|| {
            app.shell().sidecar("binaries/proxmark3").ok()
                .and_then(|cmd| cmd.args([port]).spawn().ok())
        });

        let (rx, child) = if let Some(result) = spawn_result {
            result
        } else {
            let scope_names = pm3_scope_names();
            let mut first_err: Option<String> = None;
            let mut found = None;

            // Try v4.x `-p PORT` first
            for name in &scope_names {
                match app.shell().command(name).args(["-p", port]).spawn() {
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

            // Fallback: old-style `PORT` for v3.x clients
            if found.is_none() {
                for name in &scope_names {
                    match app.shell().command(name).args([port]).spawn() {
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
    ///
    /// The PM3 client outputs version info then writes `pm3 --> ` without a
    /// trailing newline. Because the OS pipe is line-buffered, that prompt
    /// never arrives as a stdout event. To flush it, we send a newline after
    /// the version info stops flowing, which triggers the client to redisplay
    /// the prompt with surrounding newlines that DO flush through the pipe.
    pub async fn wait_for_ready(&self) -> Result<String, AppError> {
        eprintln!("[transport_interactive] wait_for_ready starting...");
        // Wait for version info to start flowing, then send a nudge
        let mut got_content = false;
        let mut accumulated = String::new();
        let deadline = tokio::time::Instant::now() + PROMPT_TIMEOUT;

        {
            let mut rx_guard = self.rx.lock().await;
            let rx = rx_guard.as_mut().ok_or_else(|| {
                AppError::CommandFailed("PM3 process not available".into())
            })?;

            loop {
                let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                if remaining.is_zero() {
                    break;
                }

                // Use a short timeout (2s) once we've seen content — if no more
                // data arrives, the version dump is done and we can send the nudge.
                let wait_dur = if got_content {
                    Duration::from_secs(2).min(remaining)
                } else {
                    remaining
                };

                match timeout(wait_dur, rx.recv()).await {
                    Err(_) if got_content => {
                        eprintln!("[transport_interactive] version output done, sending nudge...");
                        break;
                    }
                    Err(_) => {
                        eprintln!("[transport_interactive] TIMEOUT: no output from PM3");
                        return Err(AppError::Timeout(
                            "No output from PM3 process".into(),
                        ));
                    }
                    Ok(None) => {
                        eprintln!("[transport_interactive] PM3 process exited during startup");
                        return Err(AppError::CommandFailed(
                            "PM3 process exited during startup".into(),
                        ));
                    }
                    Ok(Some(event)) => match event {
                        CommandEvent::Stdout(bytes) => {
                            let raw = String::from_utf8_lossy(&bytes);
                            let cleaned = strip_ansi(&raw);
                            // Check raw chunk for prompt/echo
                            if contains_pm3_prompt(&cleaned) {
                                for line in cleaned.lines() {
                                    let trimmed = line.trim();
                                    if !trimmed.is_empty() && !is_prompt_or_echo(trimmed) {
                                        accumulated.push_str(trimmed);
                                        accumulated.push('\n');
                                    }
                                }
                                return Ok(accumulated);
                            }
                            for line in cleaned.lines() {
                                let trimmed = line.trim();
                                if !trimmed.is_empty() && !is_prompt_or_echo(trimmed) {
                                    got_content = true;
                                    accumulated.push_str(trimmed);
                                    accumulated.push('\n');
                                }
                            }
                        }
                        CommandEvent::Stderr(_) => {
                            got_content = true;
                        }
                        CommandEvent::Terminated(_) | CommandEvent::Error(_) => {
                            return Err(AppError::CommandFailed(
                                "PM3 process died during startup".into(),
                            ));
                        }
                        _ => {}
                    },
                }
            }
        } // drop rx_guard so write_stdin can take the child lock

        // Send a real command to flush the buffered prompt.
        // An empty line doesn't produce enough output to flush the pipe.
        // `hw status` generates multiple lines that flush through, and the
        // trailing prompt also gets pushed out with them.
        self.write_stdin("hw status")?;

        // Read until prompt appears after the command output
        self.read_until_prompt(15, Some("hw status"), &mut |_| {})
            .await
            .map(|post_nudge| format!("{}{}", accumulated, post_nudge))
    }

    /// Read output from the PM3 process until a prompt line is detected.
    ///
    /// PM3 prompts look like:
    /// - `pm3 --> ` (default)
    /// - `[usb] pm3 --> ` (connected via USB)
    /// - `[bt] pm3 --> ` (connected via Bluetooth)
    /// - `proxmark3> ` (older firmware)
    ///
    /// In pipe/script mode, PM3 echoes each command as it's read from stdin:
    /// `[usb] pm3 --> hw version\n` — this echo arrives BEFORE the command
    /// executes. If `sent_cmd` is provided, the first `pm3 -->` occurrence
    /// matching that command is recognized as the echo and skipped, preventing
    /// premature return before actual command output arrives.
    ///
    /// After the echo is skipped, this function continues reading until it
    /// sees a second `pm3 -->` (the real completion prompt). If the prompt
    /// doesn't flush (pipe buffering), a silence timeout returns the
    /// accumulated output instead of waiting for the full deadline:
    /// - 5s if no output received yet (fast return for no-output commands)
    /// - 15s if output is flowing (handles slow commands with long gaps)
    async fn read_until_prompt(
        &self,
        timeout_secs: u64,
        sent_cmd: Option<&str>,
        on_line: &mut (dyn FnMut(OutputLine) + Send),
    ) -> Result<String, AppError> {
        let mut rx_guard = self.rx.lock().await;
        let rx = rx_guard.as_mut().ok_or_else(|| {
            AppError::CommandFailed("PM3 process not available".into())
        })?;

        let full_deadline = Duration::from_secs(timeout_secs);
        let mut accumulated = String::new();
        let mut echo_skipped = sent_cmd.is_none(); // No echo to skip if no command given
        let mut got_output = false; // Have we received any real output lines?

        loop {
            // After skipping the echo, use a silence timeout so we don't block
            // forever when the prompt doesn't flush through the pipe.
            // - Before any output: 5s (fast return for no-output commands)
            // - After output starts: 15s (handles slow commands like `lf search -u`
            //   that have long gaps between output during demodulation phases)
            let wait_dur = if !echo_skipped {
                full_deadline
            } else if got_output {
                Duration::from_secs(15).min(full_deadline)
            } else {
                Duration::from_secs(5).min(full_deadline)
            };

            match timeout(wait_dur, rx.recv()).await {
                Err(_) if echo_skipped => {
                    // Silence after echo — prompt likely stayed in pipe buffer.
                    // Return what we have; this is normal for pipe-buffered mode.
                    eprintln!(
                        "[read_until_prompt] silence timeout after echo ({}s, got_output={}), returning {} bytes",
                        wait_dur.as_secs(),
                        got_output,
                        accumulated.len()
                    );
                    self.prompt_notify.notify_one();
                    return Ok(accumulated);
                }
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

                        if contains_pm3_prompt(&cleaned) {
                            // Check if this is the echo of the command we just sent.
                            // In script mode, PM3 echoes: [usb] pm3 --> <cmd>
                            // This arrives BEFORE the command executes, so we must
                            // skip it to avoid returning with no output.
                            if !echo_skipped {
                                if let Some(cmd) = sent_cmd {
                                    if is_echo_of_command(&cleaned, cmd) {
                                        eprintln!(
                                            "[read_until_prompt] skipping command echo for '{}'",
                                            cmd
                                        );
                                        echo_skipped = true;
                                        // Extract any non-prompt content from this chunk
                                        // (unlikely but handle gracefully)
                                        for line in cleaned.lines() {
                                            let trimmed = line.trim();
                                            if !trimmed.is_empty()
                                                && !is_prompt_or_echo(trimmed)
                                            {
                                                on_line(OutputLine {
                                                    text: trimmed.to_string(),
                                                    is_error: false,
                                                });
                                                accumulated.push_str(trimmed);
                                                accumulated.push('\n');
                                                got_output = true;
                                            }
                                        }
                                        continue; // Skip — keep reading for real output
                                    }
                                }
                            }

                            // This is a real prompt (not our command's echo).
                            // Extract any output lines from this chunk, then return.
                            for line in cleaned.lines() {
                                let trimmed = line.trim();
                                if !trimmed.is_empty() && !is_prompt_or_echo(trimmed) {
                                    on_line(OutputLine {
                                        text: trimmed.to_string(),
                                        is_error: false,
                                    });
                                    accumulated.push_str(trimmed);
                                    accumulated.push('\n');
                                }
                            }
                            self.prompt_notify.notify_one();
                            return Ok(accumulated);
                        }

                        // No prompt in this chunk — regular output lines.
                        echo_skipped = true; // Real output means echo phase is over.
                        for line in cleaned.lines() {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            on_line(OutputLine {
                                text: trimmed.to_string(),
                                is_error: false,
                            });
                            accumulated.push_str(trimmed);
                            accumulated.push('\n');
                            got_output = true;
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
                            got_output = true;
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

        // Read output until the prompt returns.
        // Pass `cmd` so we can skip the script-mode echo that PM3 sends
        // before executing the command (e.g., `[usb] pm3 --> hw version`).
        self.read_until_prompt(PROMPT_TIMEOUT.as_secs(), Some(cmd), &mut |_| {})
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

        self.read_until_prompt(timeout_secs, Some(cmd), &mut |line| {
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

/// Check if a raw chunk of text contains a PM3 prompt or command echo.
///
/// In pipe mode, the PM3 prompt (`pm3 --> `) has no trailing newline, so it
/// stays in the pipe buffer until the NEXT command is sent. The prompt then
/// flushes as `[usb|script] pm3 --> NEXT_CMD\n` (an "echo" line).
fn contains_pm3_prompt(text: &str) -> bool {
    text.contains("pm3 -->") || text.contains("proxmark3>")
}

/// Check if a line is a PM3 prompt or command echo — either way, it should
/// be filtered from command output.
fn is_prompt_or_echo(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.contains("pm3 -->") || trimmed.contains("proxmark3>")
}

/// Check if a chunk contains the echo of the command we just sent.
///
/// In script/pipe mode, PM3 echoes each command before executing it:
///   `[usb] pm3 --> hw version`
///
/// This echo arrives BEFORE the command output. We must recognize and skip
/// it to prevent `read_until_prompt` from returning prematurely (with no
/// output or stale output from a previous command).
///
/// The match is by the first word of the command (e.g., "hw" for "hw version")
/// to handle cases where PM3 slightly reformats the echo.
fn is_echo_of_command(text: &str, cmd: &str) -> bool {
    let cmd_first_word = cmd.split_whitespace().next().unwrap_or(cmd);
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(pos) = trimmed.find("pm3 -->") {
            let after = trimmed[pos + 7..].trim(); // 7 = "pm3 -->".len()
            // Match if the text after `pm3 -->` starts with the command
            // (full match or first-word match for robustness)
            if after == cmd
                || after.starts_with(&format!("{} ", cmd))
                || after.starts_with(&format!("{} ", cmd_first_word))
                || after == cmd_first_word
            {
                return true;
            }
        }
    }
    false
}
