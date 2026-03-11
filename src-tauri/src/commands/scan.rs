use std::sync::Mutex;
use tauri::State;

use crate::cards::types::{CardType, RecoveryAction};
use crate::error::AppError;
use crate::pm3::{command_builder, output_parser};
use crate::pm3::session::Pm3Session;
use crate::state::{WizardAction, WizardMachine, WizardState};

#[tauri::command]
pub async fn scan_card(
    session: State<'_, Pm3Session>,
    machine: State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    // Validate we're in DeviceConnected state, then transition to ScanningCard
    {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        match &m.current {
            WizardState::DeviceConnected { .. } => {}
            _ => {
                return Err(AppError::InvalidTransition(
                    "Must be in DeviceConnected to scan".to_string(),
                ));
            }
        };
        m.transition(WizardAction::StartScan)?;
    };

    // Log device capabilities for debugging
    {
        let caps = session.get_capabilities();
        eprintln!("[scan] === Device Capabilities ===");
        eprintln!("[scan] Platform: {:?}, HW variant: {}", caps.platform, caps.hardware_variant);
        eprintln!("[scan] Client: {}", caps.client_version);
        eprintln!("[scan] Firmware: {}", caps.firmware_version);
        eprintln!("[scan] Versions match: {}", caps.versions_match);
        if caps.has_module_info() {
            eprintln!("[scan] Compiled LF modules: {:?}", caps.compiled_with_lf);
            eprintln!("[scan] Compiled HF modules: {:?}", caps.compiled_with_hf);
        } else {
            eprintln!("[scan] No compiled module info available (older firmware?)");
        }
        eprintln!("[scan] ==============================");
    }

    // 1. Try LF search first (fast path for 125 kHz cards)
    eprintln!("[scan] Running LF search...");
    let lf_result =
        session.run_command(&command_builder::build_lf_search()).await;

    match &lf_result {
        Ok(output) => {
            eprintln!("[scan] LF search output ({} bytes):", output.len());
            // Log first 500 chars of raw output for debugging
            let preview = if output.len() > 500 { &output[..500] } else { output };
            for line in preview.lines() {
                eprintln!("[scan]   LF> {}", line);
            }
            if output.len() > 500 {
                eprintln!("[scan]   LF> ... ({} more bytes)", output.len() - 500);
            }
        }
        Err(e) => {
            eprintln!("[scan] LF search FAILED: {}", e);
        }
    }

    if let Ok(ref output) = lf_result {
        let parsed = output_parser::parse_lf_search(output);
        eprintln!("[scan] LF parse result: {:?}", parsed.as_ref().map(|(ct, _)| ct));
        if let Some((card_type, card_data)) = parsed {
            eprintln!("[scan] LF card found: {:?}, UID: {}", card_type, card_data.uid);
            return finish_scan(&machine, card_type, card_data);
        }
    }

    // 2. LF found nothing → try HF search (13.56 MHz)
    eprintln!("[scan] LF found nothing, running HF search...");
    let hf_result =
        session.run_command(&command_builder::build_hf_search()).await;

    match hf_result {
        Ok(output) => {
            eprintln!("[scan] HF search output ({} bytes):", output.len());
            // Log first 500 chars of raw output for debugging
            let preview = if output.len() > 500 { &output[..500] } else { &output };
            for line in preview.lines() {
                eprintln!("[scan]   HF> {}", line);
            }
            if output.len() > 500 {
                eprintln!("[scan]   HF> ... ({} more bytes)", output.len() - 500);
            }

            let parsed = output_parser::parse_hf_search(&output);
            eprintln!("[scan] HF parse result: {:?}", parsed.as_ref().map(|(ct, _)| ct));

            if let Some((card_type, mut card_data)) = parsed
            {
                eprintln!("[scan] HF card found: {:?}, UID: {}", card_type, card_data.uid);
                // Enrich HF data with protocol-specific info commands
                enrich_hf_data(session.inner(), &card_type, &mut card_data).await;
                return finish_scan(&machine, card_type, card_data);
            }

            eprintln!("[scan] Neither LF nor HF found a card");

            // Neither LF nor HF found a card — check if modules are missing
            let caps = session.get_capabilities();
            let user_message = if caps.has_module_info() {
                let mut missing = Vec::new();
                if !caps.has_hf_module("14443A") {
                    missing.push("ISO 14443A (MIFARE/NTAG)");
                }
                if !caps.has_hf_module("iCLASS") {
                    missing.push("iCLASS");
                }
                if !caps.has_hf_module("DESFire") {
                    missing.push("DESFire");
                }
                if !caps.has_lf_module("HID") {
                    missing.push("HID Prox");
                }
                if !caps.has_lf_module("EM 4x05") {
                    missing.push("EM4100");
                }
                if missing.is_empty() {
                    "No card found. Place the card on the reader and try again.".to_string()
                } else {
                    format!(
                        "No card found. Your firmware is missing modules: {}. \
                         These were likely skipped during flashing due to limited storage. \
                         Rebuild firmware with the modules you need, or use a device with more flash memory.",
                        missing.join(", ")
                    )
                }
            } else {
                "No card found. Place the card on the reader and try again.".to_string()
            };

            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::ReportError {
                message: "No card detected".to_string(),
                user_message,
                recoverable: true,
                recovery_action: Some(RecoveryAction::Retry),
            })?;
            Ok(m.current.clone())
        }
        Err(_) => {
            // HF search also failed — check if LF had a connection error
            if let Err(e) = lf_result {
                let mut m = machine.lock().map_err(|e| {
                    AppError::CommandFailed(format!("State lock poisoned: {}", e))
                })?;
                m.transition(WizardAction::ReportError {
                    message: e.to_string(),
                    user_message: "Scan failed. Check device connection.".to_string(),
                    recoverable: true,
                    recovery_action: Some(RecoveryAction::Reconnect),
                })?;
                Ok(m.current.clone())
            } else {
                let mut m = machine.lock().map_err(|e| {
                    AppError::CommandFailed(format!("State lock poisoned: {}", e))
                })?;
                m.transition(WizardAction::ReportError {
                    message: "No card detected".to_string(),
                    user_message:
                        "No card found. Place the card on the reader and try again."
                            .to_string(),
                    recoverable: true,
                    recovery_action: Some(RecoveryAction::Retry),
                })?;
                Ok(m.current.clone())
            }
        }
    }
}

/// Enrich HF card data with protocol-specific info commands.
/// For MIFARE Classic: `hf 14a info` (PRNG) + `hf mf info` (magic detection).
/// For UL/NTAG: `hf mfu info` for subtype detection.
async fn enrich_hf_data(
    session: &Pm3Session,
    card_type: &CardType,
    card_data: &mut crate::cards::types::CardData,
) {
    match card_type {
        CardType::MifareClassic1K | CardType::MifareClassic4K => {
            // Get PRNG info if not already present
            if !card_data.decoded.contains_key("prng") {
                if let Ok(info_output) =
                    session.run_command(&command_builder::build_hf_14a_info())
                        .await
                {
                    let clean = output_parser::strip_ansi(&info_output);
                    if let Some(caps) =
                        regex::Regex::new(r"(?i)Prng\s+detection[\s.:]+(WEAK|HARD|STATIC)")
                            .ok()
                            .and_then(|re| re.captures(&clean))
                    {
                        card_data
                            .decoded
                            .insert("prng".to_string(), caps[1].to_uppercase());
                    }
                }
            }
            // Get magic card info
            if !card_data.decoded.contains_key("magic") {
                if let Ok(mf_output) =
                    session.run_command(&command_builder::build_hf_mf_info())
                        .await
                {
                    let clean = output_parser::strip_ansi(&mf_output);
                    if let Some(caps) = regex::Regex::new(r"(?i)(?:Magic|Gen(?:eration)?)\s*(?:capabilities)?[\s.:]*(?::[\s.]*)?(Gen\s*1[ab]?|CUID|USCUID|Gen\s*2|Gen\s*3|APDU|UFUID|GDM|Gen\s*4\s*(?:GTU|GDM)?|[Uu]ltimate)")
                        .ok()
                        .and_then(|re| re.captures(&clean))
                    {
                        card_data
                            .decoded
                            .insert("magic".to_string(), caps[1].to_string());
                    }
                }
            }
        }
        CardType::MifareUltralight | CardType::NTAG => {
            // Get UL/NTAG subtype info
            if let Ok(mfu_output) =
                session.run_command(&command_builder::build_hf_mfu_info()).await
            {
                let clean = output_parser::strip_ansi(&mfu_output);
                // Check for NTAG type
                if let Some(caps) = regex::Regex::new(r"(?i)NTAG\s*(\d{3})")
                    .ok()
                    .and_then(|re| re.captures(&clean))
                {
                    card_data
                        .decoded
                        .insert("ntag_type".to_string(), format!("NTAG{}", &caps[1]));
                }
                // Check for UL type
                if let Some(caps) =
                    regex::Regex::new(r"(?i)(?:MIFARE\s+)?Ultralight(?:\s+(EV1|C|Nano|AES))?")
                        .ok()
                        .and_then(|re| re.captures(&clean))
                {
                    if let Some(ul_variant) = caps.get(1) {
                        card_data.decoded.insert(
                            "ul_type".to_string(),
                            format!("Ultralight {}", ul_variant.as_str()),
                        );
                    }
                }
            }
        }
        CardType::IClass => {
            // Check if card is Elite/SE (requires diversified keys)
            if let Ok(info_output) =
                session.run_command(command_builder::build_hf_iclass_info()).await
            {
                if output_parser::is_iclass_elite(&info_output) {
                    card_data.decoded.insert("iclass_elite".to_string(), "true".to_string());
                }
            }
        }
        _ => {}
    }
}

/// Common finish: transition FSM to CardFound with detected card info.
fn finish_scan(
    machine: &Mutex<WizardMachine>,
    card_type: CardType,
    card_data: crate::cards::types::CardData,
) -> Result<WizardState, AppError> {
    let frequency = card_type.frequency();
    let cloneable = card_type.is_cloneable();
    let recommended_blank = card_type.recommended_blank();

    let mut m = machine.lock().map_err(|e| {
        AppError::CommandFailed(format!("State lock poisoned: {}", e))
    })?;
    m.transition(WizardAction::CardFound {
        frequency,
        card_type,
        card_data,
        cloneable,
        recommended_blank,
    })?;
    Ok(m.current.clone())
}
