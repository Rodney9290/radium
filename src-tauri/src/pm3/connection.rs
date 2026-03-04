use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Payload emitted as `pm3-output` events for the live terminal panel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm3OutputPayload {
    pub text: String,
    pub is_error: bool,
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
