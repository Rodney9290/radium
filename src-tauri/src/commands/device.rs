use std::sync::Mutex;
use tauri::State;

use crate::error::AppError;
use crate::pm3::capabilities::DeviceCapabilities;
use crate::pm3::session::Pm3Session;
use crate::state::{WizardAction, WizardMachine, WizardState};

#[tauri::command]
pub async fn detect_device(
    session: State<'_, Pm3Session>,
    machine: State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    // Transition to DetectingDevice
    {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        m.transition(WizardAction::StartDetection)?;
    }

    match session.connect().await {
        Ok(caps) => {
            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::DeviceFound {
                port: caps.port,
                model: caps.model,
                firmware: caps.firmware_version,
            })?;
            Ok(m.current.clone())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let user_message = if err_msg.contains("spawn")
                || err_msg.contains("not found")
                || err_msg.contains("No such file")
                || err_msg.contains("program not found")
            {
                "Proxmark3 binary not found. Ensure proxmark3 is installed and in your PATH."
                    .to_string()
            } else {
                "No Proxmark3 device found. Check your USB connection.".to_string()
            };
            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::ReportError {
                message: err_msg,
                user_message,
                recoverable: true,
                recovery_action: Some(crate::cards::types::RecoveryAction::Retry),
            })?;
            Ok(m.current.clone())
        }
    }
}

/// Get the cached device capabilities from the active session.
/// Returns the full DeviceCapabilities struct including platform, features, etc.
#[tauri::command]
pub async fn get_device_capabilities(
    session: State<'_, Pm3Session>,
) -> Result<DeviceCapabilities, AppError> {
    if !session.is_connected() {
        return Err(AppError::CommandFailed("Not connected to a PM3 device".into()));
    }
    Ok(session.get_capabilities())
}
