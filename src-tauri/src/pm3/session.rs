use std::sync::{Arc, Mutex, RwLock};

use tauri::AppHandle;

use crate::error::AppError;
use crate::pm3::capabilities::DeviceCapabilities;
use crate::pm3::connection::emit_output;
use crate::pm3::device_finder;
use crate::pm3::transport::Pm3Transport;
use crate::pm3::transport_cli::CliTransportBatch;
use crate::pm3::transport_interactive::CliTransportInteractive;
use crate::pm3::types::OutputLine;
use crate::pm3::version::parse_detailed_hw_version;

/// Central session manager for PM3 device communication.
///
/// Owns a single transport connection and serializes all commands through
/// an async lock. This prevents race conditions from concurrent commands
/// and keeps the serial port stable across the session.
///
/// Managed as Tauri state via `app.manage()`.
pub struct Pm3Session {
    /// The active transport (None when disconnected).
    /// Uses tokio::sync::Mutex so it can be held across await points.
    /// Arc allows sharing with cancel_handle for concurrent cancellation.
    transport: tokio::sync::Mutex<Option<Arc<dyn Pm3Transport>>>,
    /// Separate reference for cancellation — allows cancel_current() to work
    /// even while a streaming command holds the transport lock.
    /// The transport's cancel() uses its own internal mutex, so this is safe.
    cancel_handle: Mutex<Option<Arc<dyn Pm3Transport>>>,
    /// Tauri app handle for event emission and shell access.
    app: AppHandle,
    /// Cached device capabilities from `hw version`.
    capabilities: RwLock<DeviceCapabilities>,
    /// Active port (if connected).
    port: RwLock<Option<String>>,
    /// Dump file path from HF operations (autopwn, dump).
    dump_path: Mutex<Option<String>>,
}

impl Pm3Session {
    /// Create a new disconnected session.
    pub fn new(app: AppHandle) -> Self {
        Self {
            transport: tokio::sync::Mutex::new(None),
            cancel_handle: Mutex::new(None),
            app,
            capabilities: RwLock::new(DeviceCapabilities::default()),
            port: RwLock::new(None),
            dump_path: Mutex::new(None),
        }
    }

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    /// Scan for a PM3 device and establish a session.
    ///
    /// 1. Uses device_finder to probe serial ports
    /// 2. Creates a transport to the discovered port
    /// 3. Parses capabilities from discovery output
    /// 4. Returns the capabilities
    pub async fn connect(&self) -> Result<DeviceCapabilities, AppError> {
        // Disconnect any existing session first
        let _ = self.disconnect().await;

        // Discover device (uses batch probe)
        let device = device_finder::find_device(&self.app).await?;

        // Try interactive transport first, fall back to batch
        let transport: Arc<dyn Pm3Transport> =
            match self.try_interactive(&device.port).await {
                Ok(t) => t,
                Err(_) => Arc::new(CliTransportBatch::new(
                    self.app.clone(),
                    device.port.clone(),
                )),
            };

        // Parse capabilities from the discovery probe output
        let info = parse_detailed_hw_version(&device.hw_version_output);
        let caps = DeviceCapabilities::from_hw_version(
            device.port.clone(),
            device.model.clone(),
            info.client_version,
            device.firmware.clone(),
            info.versions_match,
            device.hardware_variant.clone(),
            &device.hw_version_output,
        );

        self.store_session(transport, &device.port, caps.clone()).await?;
        Ok(caps)
    }

    /// Connect to a specific port (used when port is already known).
    pub async fn connect_to_port(&self, port: &str) -> Result<DeviceCapabilities, AppError> {
        let _ = self.disconnect().await;

        // Try interactive transport first, fall back to batch
        let transport: Arc<dyn Pm3Transport> =
            match self.try_interactive(port).await {
                Ok(t) => t,
                Err(_) => Arc::new(CliTransportBatch::new(
                    self.app.clone(),
                    port.to_string(),
                )),
            };

        // Run hw version to get capabilities
        let output = transport.send("hw version").await?;
        let info = parse_detailed_hw_version(&output);

        let firmware = if !info.os_version.is_empty() {
            info.os_version.clone()
        } else {
            info.client_version.clone()
        };

        let caps = DeviceCapabilities::from_hw_version(
            port.to_string(),
            info.model,
            info.client_version,
            firmware,
            info.versions_match,
            info.hardware_variant,
            &output,
        );

        self.store_session(transport, port, caps.clone()).await?;
        Ok(caps)
    }

    /// Disconnect the current session.
    pub async fn disconnect(&self) -> Result<(), AppError> {
        let transport = {
            let mut t = self.transport.lock().await;
            t.take()
        };
        {
            let mut c = self.cancel_handle.lock().unwrap_or_else(|e| e.into_inner());
            *c = None;
        }

        if let Some(transport) = transport {
            let _ = transport.close().await;
        }

        if let Ok(mut p) = self.port.write() {
            *p = None;
        }
        if let Ok(mut c) = self.capabilities.write() {
            *c = DeviceCapabilities::default();
        }
        if let Ok(mut d) = self.dump_path.lock() {
            *d = None;
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Try to spawn an interactive transport to the given port.
    /// Returns the transport as an Arc if successful.
    async fn try_interactive(&self, port: &str) -> Result<Arc<dyn Pm3Transport>, AppError> {
        let transport = CliTransportInteractive::spawn(&self.app, port)?;
        transport.wait_for_ready().await?;
        Ok(Arc::new(transport))
    }

    /// Store transport, cancel handle, port, and capabilities into session state.
    async fn store_session(
        &self,
        transport: Arc<dyn Pm3Transport>,
        port: &str,
        caps: DeviceCapabilities,
    ) -> Result<(), AppError> {
        // Set transport (tokio async mutex)
        {
            let mut t = self.transport.lock().await;
            *t = Some(transport.clone());
        }
        // Set cancel handle (std sync mutex)
        {
            let mut c = self.cancel_handle.lock().unwrap_or_else(|e| e.into_inner());
            *c = Some(transport);
        }
        // Set port
        if let Ok(mut p) = self.port.write() {
            *p = Some(port.to_string());
        }
        // Set capabilities
        if let Ok(mut c) = self.capabilities.write() {
            *c = caps;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Command execution
    // -----------------------------------------------------------------------

    /// Run a command through the session with event emission.
    ///
    /// The tokio::sync::Mutex on transport ensures only one command runs
    /// at a time (serialization). This prevents race conditions from
    /// concurrent Tauri command invocations.
    pub async fn run_command(&self, cmd: &str) -> Result<String, AppError> {
        let transport_guard = self.transport.lock().await;

        let transport = transport_guard.as_ref().ok_or_else(|| {
            AppError::CommandFailed("Not connected to a PM3 device".into())
        })?;

        emit_output(&self.app, &format!("pm3 --> {}", cmd), false);

        match transport.send(cmd).await {
            Ok(output) => {
                emit_output(&self.app, &output, false);
                Ok(output)
            }
            Err(e) => {
                emit_output(&self.app, &e.to_string(), true);
                Err(e)
            }
        }
    }

    /// Run a streaming command with per-line callback.
    /// Used for long-running operations like autopwn (up to 1 hour timeout).
    pub async fn run_command_streaming<F>(
        &self,
        cmd: &str,
        timeout_secs: u64,
        mut on_line: F,
    ) -> Result<String, AppError>
    where
        F: FnMut(&str) + Send + 'static,
    {
        let transport_guard = self.transport.lock().await;

        let transport = transport_guard.as_ref().ok_or_else(|| {
            AppError::CommandFailed("Not connected to a PM3 device".into())
        })?;

        emit_output(&self.app, &format!("pm3 --> {}", cmd), false);

        let app_clone = self.app.clone();

        transport
            .send_streaming(
                cmd,
                timeout_secs,
                Box::new(move |line: OutputLine| {
                    emit_output(&app_clone, &line.text, line.is_error);
                    on_line(&line.text);
                }),
            )
            .await
    }

    /// Cancel the currently running command.
    ///
    /// Uses the separate cancel_handle to avoid needing the transport lock
    /// (which may be held by a running streaming command). The transport's
    /// cancel() method uses its own internal mutex for the child process,
    /// so this is safe to call concurrently.
    pub fn cancel_current(&self) -> Result<(), AppError> {
        let guard = self.cancel_handle.lock().map_err(|e| {
            AppError::CommandFailed(format!("Cancel handle lock poisoned: {}", e))
        })?;
        if let Some(ref transport) = *guard {
            transport.cancel()?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // State accessors
    // -----------------------------------------------------------------------

    /// Get the app handle (for commands that need to emit custom events).
    pub fn app(&self) -> &AppHandle {
        &self.app
    }

    /// Check if a session is active.
    pub fn is_connected(&self) -> bool {
        match self.cancel_handle.lock() {
            Ok(c) => c.is_some(),
            Err(_) => false,
        }
    }

    /// Get the active port.
    pub fn get_port(&self) -> Option<String> {
        self.port.read().ok().and_then(|p| p.clone())
    }

    /// Get cached device capabilities.
    pub fn get_capabilities(&self) -> DeviceCapabilities {
        self.capabilities
            .read()
            .map(|c| c.clone())
            .unwrap_or_default()
    }

    /// Get the HF dump file path.
    pub fn get_dump_path(&self) -> Option<String> {
        self.dump_path.lock().ok().and_then(|d| d.clone())
    }

    /// Set the HF dump file path.
    pub fn set_dump_path(&self, path: Option<String>) {
        if let Ok(mut d) = self.dump_path.lock() {
            *d = path;
        }
    }
}
