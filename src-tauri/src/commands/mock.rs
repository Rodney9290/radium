use std::sync::Mutex;
use tauri::State;

use crate::error::AppError;
use crate::pm3::session::Pm3Session;
use crate::state::{WizardAction, WizardMachine, WizardState};

/// Connect a simulated PM3 device for testing without hardware.
///
/// `scenario` controls which card type scan commands return:
///   em4100 | hid | indala | mifare1k | mifare4k | ultralight | ntag | desfire | iclass
///
/// Call this instead of `detect_device` when no real PM3 is plugged in.
#[tauri::command]
pub async fn connect_mock_device(
    scenario: String,
    session: State<'_, Pm3Session>,
    machine: State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        m.transition(WizardAction::StartDetection)?;
    }

    let caps = session.connect_mock(&scenario).await?;

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
