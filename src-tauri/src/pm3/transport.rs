use async_trait::async_trait;

use crate::error::AppError;
use crate::pm3::types::OutputLine;

/// Abstraction over how we communicate with a PM3 device.
///
/// Implementations:
/// - `CliTransport`: persistent interactive PM3 process via stdin/stdout
/// - `CliTransportBatch`: spawn-per-command fallback (legacy `-f -c` mode)
/// - Future: `FfiTransport` (direct library calls, Phase 4)
#[async_trait]
pub trait Pm3Transport: Send + Sync {
    /// Send a command and return collected output.
    /// The transport handles prompt detection and output accumulation.
    async fn send(&self, cmd: &str) -> Result<String, AppError>;

    /// Send a command with per-line streaming output.
    /// Each output line is passed to the callback as it arrives.
    /// Returns accumulated output when the command completes.
    async fn send_streaming(
        &self,
        cmd: &str,
        timeout_secs: u64,
        on_line: Box<dyn FnMut(OutputLine) + Send>,
    ) -> Result<String, AppError>;

    /// Check if the transport is still connected and responsive.
    async fn is_alive(&self) -> bool;

    /// Cancel the currently running command (e.g., kill subprocess).
    fn cancel(&self) -> Result<(), AppError>;

    /// Gracefully close the transport connection.
    async fn close(&self) -> Result<(), AppError>;
}
