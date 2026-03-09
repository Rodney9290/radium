use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::pm3::{command_builder, output_parser};
use crate::pm3::session::Pm3Session;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntennaResult {
    /// LF antenna peak voltage in millivolts (None if parse failed)
    pub lf_voltage_mv: Option<f32>,
    /// HF antenna peak voltage in millivolts (None if parse failed)
    pub hf_voltage_mv: Option<f32>,
    /// True if LF voltage is above the recommended 15 000 mV threshold
    pub lf_ok: bool,
    /// True if HF voltage is above the recommended 5 000 mV threshold
    pub hf_ok: bool,
    /// Raw `hw tune` output for display
    pub raw_output: String,
}

/// Parse LF voltage (mV) from `hw tune` output.
/// Looks for lines like: "LF antenna: 47.36 V @ 125.00 kHz"
fn parse_lf_mv(output: &str) -> Option<f32> {
    let clean = output_parser::strip_ansi(output);
    for line in clean.lines() {
        let lower = line.to_lowercase();
        if lower.contains("lf antenna") {
            // Match "XX.XX V" anywhere in the line
            if let Some(v) = extract_voltage_mv(line) {
                return Some(v);
            }
        }
    }
    None
}

/// Parse HF voltage (mV) from `hw tune` output.
/// Looks for lines like: "HF antenna: 28.13 V @ 13.56 MHz"
fn parse_hf_mv(output: &str) -> Option<f32> {
    let clean = output_parser::strip_ansi(output);
    for line in clean.lines() {
        let lower = line.to_lowercase();
        if lower.contains("hf antenna") {
            if let Some(v) = extract_voltage_mv(line) {
                return Some(v);
            }
        }
    }
    None
}

/// Extract a voltage value in mV from a line containing "XX.XX V".
fn extract_voltage_mv(line: &str) -> Option<f32> {
    // Match patterns like "47.36 V" or "47 V"
    let re = regex::Regex::new(r"(\d+(?:\.\d+)?)\s*[Vv]\b").ok()?;
    let caps = re.captures(line)?;
    let volts: f32 = caps[1].parse().ok()?;
    Some(volts * 1000.0)
}

#[tauri::command]
pub async fn hw_tune(session: State<'_, Pm3Session>) -> Result<AntennaResult, AppError> {
    if !session.is_connected() {
        return Err(AppError::CommandFailed("Not connected to a PM3 device".into()));
    }

    let output = session.run_command(&command_builder::build_hw_tune()).await?;

    let lf_voltage_mv = parse_lf_mv(&output);
    let hf_voltage_mv = parse_hf_mv(&output);

    Ok(AntennaResult {
        lf_ok: lf_voltage_mv.map(|v| v >= 10_000.0).unwrap_or(false),
        hf_ok: hf_voltage_mv.map(|v| v >= 3_000.0).unwrap_or(false),
        lf_voltage_mv,
        hf_voltage_mv,
        raw_output: output,
    })
}
