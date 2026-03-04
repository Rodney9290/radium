use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Payload emitted as `pm3-output` events for the live terminal panel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm3OutputPayload {
    pub text: String,
    pub is_error: bool,
}

/// Payload emitted as `device-status` events for connection state tracking.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatusPayload {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Emit a device connection status event to the frontend.
pub fn emit_device_status(
    app: &AppHandle,
    status: &str,
    port: Option<&str>,
    reason: Option<&str>,
) {
    let _ = app.emit(
        "device-status",
        DeviceStatusPayload {
            status: status.to_string(),
            port: port.map(|s| s.to_string()),
            reason: reason.map(|s| s.to_string()),
        },
    );
}

/// Emit raw PM3 output to the frontend terminal panel.
pub fn emit_output(app: &AppHandle, text: &str, is_error: bool) {
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let _ = app.emit(
            "pm3-output",
            Pm3OutputPayload {
                text: trimmed.to_string(),
                is_error,
            },
        );
    }
}
