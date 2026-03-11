use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::cards::types::{AutopwnEvent, BlankType, CardType, ProcessPhase, RecoveryAction};
use crate::error::AppError;
use crate::pm3::session::Pm3Session;
use crate::pm3::{command_builder, output_parser};
use crate::state::{WizardAction, WizardMachine, WizardState};

/// Payload emitted as `hf-progress` events during autopwn.
#[derive(Debug, Clone, Serialize)]
struct HfProgressPayload {
    phase: String,
    keys_found: u32,
    keys_total: u32,
    elapsed_secs: u32,
}

/// Run `hf mf autopwn` with streaming progress. Recovers all keys and dumps
/// the card memory. Long-running (seconds to hours depending on PRNG type).
///
/// Transitions: CardIdentified -> HfProcessing -> HfDumpReady (or Error).
#[tauri::command]
pub async fn hf_autopwn(
    app: AppHandle,
    machine: State<'_, Mutex<WizardMachine>>,
    session: State<'_, Pm3Session>,
) -> Result<WizardState, AppError> {
    // Extract card_type and card_data from current state, then transition to HfProcessing
    let (card_type, card_prng, card_mfr) = {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        let (card_type, prng, mfr) = match &m.current {
            WizardState::CardIdentified { card_type, card_data, .. } => {
                match card_type {
                    CardType::MifareClassic1K | CardType::MifareClassic4K => {}
                    _ => {
                        return Err(AppError::CommandFailed(format!(
                            "Autopwn only supports MIFARE Classic, got {:?}",
                            card_type
                        )));
                    }
                }
                let prng = card_data.decoded.get("prng").cloned().unwrap_or_default();
                let mfr = card_data.decoded.get("manufacturer").cloned().unwrap_or_default();
                (card_type.clone(), prng, mfr)
            }
            _ => {
                return Err(AppError::InvalidTransition(
                    "Must be in CardIdentified to run autopwn".to_string(),
                ));
            }
        };
        m.transition(WizardAction::StartHfProcess)?;
        (card_type, prng, mfr)
    };

    let cmd = command_builder::build_hf_autopwn(&card_type);
    let start_time = Instant::now();

    // Shared progress state between the streaming closure and post-await code.
    // Wrapped in Arc<Mutex<>> because the closure is `move` + `Send`.
    struct ProgressState {
        phase: ProcessPhase,
        keys_found: u32,
        keys_total: u32,
        dump_file: Option<String>,
        dump_complete: bool,
        dump_partial: bool,
    }

    let initial_keys_total: u32 = match card_type {
        CardType::MifareClassic4K => 80,
        _ => 32,
    };

    // FM11RF08S hardware backdoor pre-check (Quarkslab Aug 2024).
    // Try the universal backdoor key before running full autopwn.
    // On real hardware, iceman's autopwn already does this; this pre-step
    // emits a dedicated phase event so the UI can display it.
    let is_static_prng = card_prng.eq_ignore_ascii_case("STATIC");
    let is_fudan = card_mfr.to_lowercase().contains("fudan")
        || card_mfr.to_lowercase().contains("fm11rf08");
    if is_static_prng || is_fudan {
        let _ = app.emit(
            "hf-progress",
            HfProgressPayload {
                phase: "BackdoorCheck".to_string(),
                keys_found: 0,
                keys_total: initial_keys_total,
                elapsed_secs: 0,
            },
        );
        // Non-fatal — autopwn handles all attacks regardless of result
        let _ = session.run_command(command_builder::build_hf_mf_backdoor_chk()).await;
    }

    let progress = Arc::new(Mutex::new(ProgressState {
        phase: ProcessPhase::KeyCheck,
        keys_found: 0,
        keys_total: initial_keys_total,
        dump_file: None,
        dump_complete: false,
        dump_partial: false,
    }));

    let app_for_closure = app.clone();
    let progress_for_closure = progress.clone();

    // Emit initial progress so the frontend shows 0/32 (or 0/80) immediately
    let _ = app.emit(
        "hf-progress",
        HfProgressPayload {
            phase: format!("{:?}", ProcessPhase::KeyCheck),
            keys_found: 0,
            keys_total: initial_keys_total,
            elapsed_secs: 0,
        },
    );

    // Run streaming command with per-line autopwn parsing (1h timeout for hardnested)
    let result = session
        .run_command_streaming(
            &cmd,
            3600,
            move |line: &str| {
                if let Some(event) = output_parser::parse_autopwn_line(line) {
                    let elapsed = start_time.elapsed().as_secs() as u32;
                    let mut st = progress_for_closure.lock().unwrap();

                    match &event {
                        AutopwnEvent::DictionaryProgress { found, total } => {
                            st.phase = ProcessPhase::KeyCheck;
                            st.keys_found = *found;
                            st.keys_total = *total;
                        }
                        AutopwnEvent::KeyFound { .. } => {
                            st.keys_found += 1;
                        }
                        AutopwnEvent::DarksideStarted => {
                            st.phase = ProcessPhase::Darkside;
                        }
                        AutopwnEvent::NestedStarted => {
                            st.phase = ProcessPhase::Nested;
                        }
                        AutopwnEvent::HardnestedStarted => {
                            st.phase = ProcessPhase::Hardnested;
                        }
                        AutopwnEvent::StaticnestedStarted => {
                            st.phase = ProcessPhase::StaticNested;
                        }
                        AutopwnEvent::DumpComplete { file_path } => {
                            st.dump_complete = true;
                            if !file_path.is_empty() {
                                st.dump_file = Some(file_path.clone());
                            }
                            st.phase = ProcessPhase::Dumping;
                        }
                        AutopwnEvent::DumpPartial { file_path } => {
                            st.dump_partial = true;
                            if !file_path.is_empty() {
                                st.dump_file = Some(file_path.clone());
                            }
                            st.phase = ProcessPhase::Dumping;
                        }
                        AutopwnEvent::Failed { .. } | AutopwnEvent::Finished { .. } => {}
                    }

                    // Emit progress event to frontend
                    let _ = app_for_closure.emit(
                        "hf-progress",
                        HfProgressPayload {
                            phase: format!("{:?}", st.phase),
                            keys_found: st.keys_found,
                            keys_total: st.keys_total,
                            elapsed_secs: elapsed,
                        },
                    );
                }
            },
        )
        .await;

    // Read final state from the shared progress
    let st = progress.lock().unwrap();

    match result {
        Ok(_output) => {
            // Store dump file path in session for the write phase
            if let Some(ref path) = st.dump_file {
                session.set_dump_path(Some(path.clone()));
            }

            let dump_info = if st.dump_complete {
                format!(
                    "All keys recovered ({}/{}). Full dump saved.",
                    st.keys_found, st.keys_total
                )
            } else if st.dump_partial {
                format!(
                    "Partial key recovery ({}/{}). Partial dump saved.",
                    st.keys_found, st.keys_total
                )
            } else if st.keys_found > 0 {
                format!("Keys recovered: {}/{}.", st.keys_found, st.keys_total)
            } else {
                "Key recovery completed.".to_string()
            };

            // Transition to HfDumpReady
            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::HfProcessComplete { dump_info })?;
            Ok(m.current.clone())
        }
        Err(e) => {
            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::ReportError {
                message: e.to_string(),
                user_message: "Key recovery failed. Check device connection and try again."
                    .to_string(),
                recoverable: true,
                recovery_action: Some(crate::cards::types::RecoveryAction::Retry),
            })?;
            Ok(m.current.clone())
        }
    }
}

/// Check if an HF dump file exists for a given UID and set the path in session.
/// Used to skip autopwn when loading a saved card that was already dumped.
/// Returns the dump file path if found, None otherwise.
#[tauri::command]
pub async fn check_dump_exists(
    uid: String,
    session: State<'_, Pm3Session>,
) -> Result<Option<String>, AppError> {
    let clean_uid: String = uid.chars().filter(|c| c.is_ascii_hexdigit()).collect::<String>().to_uppercase();
    if clean_uid.is_empty() {
        return Ok(None);
    }

    // Check common dump file locations (PM3 writes to CWD, which is usually $HOME)
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let candidates = vec![
        format!("{}/hf-mf-{}-dump.bin", home, clean_uid),
        format!("{}/hf-mf-{}-dump-001.bin", home, clean_uid),
        format!("hf-mf-{}-dump.bin", clean_uid),
        format!("hf-mf-{}-dump-001.bin", clean_uid),
    ];

    for path in candidates {
        if std::path::Path::new(&path).exists() {
            session.set_dump_path(Some(path.clone()));
            return Ok(Some(path));
        }
    }

    Ok(None)
}

/// Cancel a running HF operation (autopwn, dump, write) by killing the child process.
#[tauri::command]
pub async fn cancel_hf_operation(
    session: State<'_, Pm3Session>,
) -> Result<(), AppError> {
    session.cancel_current()
}

/// Reveal the HF dump file in the system file manager (Finder on macOS, Explorer on Windows).
/// Uses the dump path stored by hf_autopwn or hf_dump.
#[tauri::command]
pub async fn reveal_dump_file(
    session: State<'_, Pm3Session>,
    app: AppHandle,
) -> Result<(), AppError> {
    let path = session.get_dump_path().ok_or_else(|| {
        AppError::CommandFailed("No dump file available. Run key recovery first.".to_string())
    })?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::CommandFailed(format!("Failed to reveal dump file: {}", e)))?;
    Ok(())
}

/// Erase all sectors of a MIFARE Classic card back to factory defaults.
/// Requires the card's sector keys to be known (works best on fresh magic cards).
/// Returns PM3 command output.
#[tauri::command]
pub async fn hf_erase_card(
    session: State<'_, Pm3Session>,
) -> Result<String, AppError> {
    let cmd = command_builder::build_hf_mf_erase();
    let output = session.run_command(cmd).await?;
    Ok(output)
}

// ---------------------------------------------------------------------------
// HF Write Clone — 7 workflows
// ---------------------------------------------------------------------------

/// Write a dump to a magic blank card. Selects the correct write workflow based
/// on `blank_type`. The dump file path is retrieved from the session
/// (stored by `hf_autopwn` or `hf_dump`).
///
/// Transitions: BlankDetected -> Writing -> Verifying (or Error).
///
/// `source_uid` is passed from the frontend XState context because the Rust FSM
/// doesn't persist `card_data` after state transitions.
#[tauri::command]
pub async fn hf_write_clone(
    source_uid: String,
    card_type: CardType,
    blank_type: BlankType,
    machine: State<'_, Mutex<WizardMachine>>,
    session: State<'_, Pm3Session>,
) -> Result<WizardState, AppError> {
    // Validate state
    {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        match &m.current {
            WizardState::BlankDetected { .. } => {}
            _ => {
                return Err(AppError::InvalidTransition(
                    "Must be in BlankDetected to write clone".to_string(),
                ));
            }
        }
        m.transition(WizardAction::StartWrite)?;
    };

    // Get dump file path from session (set by hf_autopwn or hf_dump)
    let dump_path = session.get_dump_path().ok_or_else(|| {
        AppError::CommandFailed("No dump file available. Run key recovery first.".to_string())
    })?;

    // Run the write workflow, catching errors to report via FSM
    let result = match blank_type {
        BlankType::MagicMifareGen1a => {
            write_gen1a(session.inner(), &dump_path, &machine).await
        }
        BlankType::MagicMifareGen2 => {
            write_gen2(session.inner(), &dump_path, &source_uid, &card_type, &machine).await
        }
        BlankType::MagicMifareGen3 => {
            write_gen3(session.inner(), &dump_path, &source_uid, &card_type, &machine).await
        }
        BlankType::MagicMifareGen4GTU => {
            write_gen4_gtu(session.inner(), &dump_path, &machine).await
        }
        BlankType::MagicMifareGen4GDM => {
            write_gen4_gdm(session.inner(), &dump_path, &machine).await
        }
        BlankType::MagicUltralight => {
            write_ultralight(session.inner(), &dump_path, &machine).await
        }
        BlankType::IClassBlank => {
            write_iclass(session.inner(), &dump_path, &machine).await
        }
        BlankType::RegularMifare => {
            write_regular_mifare(session.inner(), &dump_path, &machine).await
        }
        _ => {
            Err(AppError::CommandFailed(format!(
                "Unsupported HF blank type: {:?}",
                blank_type
            )))
        }
    };

    match result {
        Ok(state) => Ok(state),
        Err(e) => {
            report_error(
                &machine,
                &e.to_string(),
                "Write failed. Do not remove the card — try again.",
                true,
                Some(RecoveryAction::Retry),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// HF Dump (UL/NTAG + iCLASS — no autopwn needed)
// ---------------------------------------------------------------------------

/// Dump an unencrypted HF card (Ultralight/NTAG or iCLASS Legacy).
/// These cards don't need autopwn key recovery — UL/NTAG is unencrypted,
/// iCLASS Legacy uses the leaked master key (key index 0).
///
/// Transitions: CardIdentified -> HfProcessing -> HfDumpReady (or Error).
#[tauri::command]
pub async fn hf_dump(
    machine: State<'_, Mutex<WizardMachine>>,
    session: State<'_, Pm3Session>,
) -> Result<WizardState, AppError> {
    // Extract card_type, transition to HfProcessing
    let card_type = {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        let card_type = match &m.current {
            WizardState::CardIdentified { card_type, .. } => {
                match card_type {
                    CardType::MifareUltralight | CardType::NTAG | CardType::IClass => {}
                    _ => {
                        return Err(AppError::CommandFailed(format!(
                            "hf_dump only supports UL/NTAG/iCLASS, got {:?}",
                            card_type
                        )));
                    }
                }
                card_type.clone()
            }
            _ => {
                return Err(AppError::InvalidTransition(
                    "Must be in CardIdentified to run dump".to_string(),
                ));
            }
        };
        m.transition(WizardAction::StartHfProcess)?;
        card_type
    };

    // Select dump command based on card type
    let (cmd_str, cmd_static);
    let cmd: &str = match card_type {
        CardType::IClass => {
            // Try stored key first (from loclass recovery), then fall back to master key
            if let Some(ref key) = session.get_iclass_key() {
                cmd_str = command_builder::build_iclass_dump_with_key(key);
                &cmd_str
            } else {
                cmd_static = command_builder::build_iclass_dump();
                cmd_static
            }
        }
        _ => {
            cmd_static = command_builder::build_mfu_dump(); // UL + NTAG
            cmd_static
        }
    };

    let result = session.run_command(cmd).await;

    match result {
        Ok(output) => {
            // Extract dump file path from output
            let dump_file = output_parser::extract_dump_file_path(&output);

            // Store dump path in session for the write phase
            if let Some(ref path) = dump_file {
                session.set_dump_path(Some(path.clone()));
            }

            let dump_info = match &card_type {
                CardType::IClass => "iCLASS dump complete.".to_string(),
                CardType::NTAG => "NTAG dump complete.".to_string(),
                _ => "Ultralight dump complete.".to_string(),
            };

            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::HfProcessComplete { dump_info })?;
            Ok(m.current.clone())
        }
        Err(e) => {
            let mut m = machine.lock().map_err(|e| {
                AppError::CommandFailed(format!("State lock poisoned: {}", e))
            })?;
            m.transition(WizardAction::ReportError {
                message: e.to_string(),
                user_message: "Dump failed. Check device connection and try again.".to_string(),
                recoverable: true,
                recovery_action: Some(RecoveryAction::Retry),
            })?;
            Ok(m.current.clone())
        }
    }
}

// ---------------------------------------------------------------------------
// Write workflow implementations
// ---------------------------------------------------------------------------

/// Gen1a: single `hf mf cload` via magic wakeup backdoor.
async fn write_gen1a(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    let cmd = command_builder::build_mf_cload(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// Gen2/CUID: config force -> wrbl0 -> restore -> config reset.
async fn write_gen2(
    session: &Pm3Session,
    dump_path: &str,
    _source_uid: &str,
    _card_type: &CardType,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    let total: u16 = 5;

    // Step 1: Force 14a config to allow block 0 write
    update_write_progress(session.app(), machine, 0.1, Some(1), Some(total))?;
    let cmd = command_builder::build_mf_gen2_config_force();
    session.run_command(cmd).await?;

    // Step 2: Read block 0 from dump and force-write it
    update_write_progress(session.app(), machine, 0.3, Some(2), Some(total))?;
    let block0 = read_block0_from_dump(dump_path)?;
    let cmd = command_builder::build_mf_wrbl0("FFFFFFFFFFFF", &block0);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    // Step 3: Restore all blocks from dump
    update_write_progress(session.app(), machine, 0.6, Some(3), Some(total))?;
    let cmd = command_builder::build_mf_restore(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    // Step 4: Reset 14a config to standard
    update_write_progress(session.app(), machine, 0.85, Some(4), Some(total))?;
    let cmd = command_builder::build_mf_gen2_config_reset();
    session.run_command(cmd).await?;

    finish_write(session, machine).await
}

/// Gen3: gen3uid -> gen3blk -> restore.
async fn write_gen3(
    session: &Pm3Session,
    dump_path: &str,
    source_uid: &str,
    _card_type: &CardType,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    let total: u16 = 4;

    // Step 1: Set UID via APDU
    update_write_progress(session.app(), machine, 0.1, Some(1), Some(total))?;
    // Extract UID without spaces/colons for gen3uid command
    let clean_uid: String = source_uid.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    let cmd = command_builder::build_mf_gen3uid(&clean_uid);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    // Step 2: Write block 0 via APDU
    update_write_progress(session.app(), machine, 0.35, Some(2), Some(total))?;
    let block0 = read_block0_from_dump(dump_path)?;
    let cmd = command_builder::build_mf_gen3blk(&block0);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    // Step 3: Restore all blocks from dump
    update_write_progress(session.app(), machine, 0.65, Some(3), Some(total))?;
    let cmd = command_builder::build_mf_restore(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// Gen4 GTU/UMC: single `hf mf gload` (GTU-specific file load).
async fn write_gen4_gtu(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    let cmd = command_builder::build_mf_gload(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// Gen4 GDM: uses `hf mf cload` via Gen1a backdoor (factory default 7AFF
/// has Gen1a enabled). Single command instead of block-by-block gdmsetblk.
async fn write_gen4_gdm(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    let cmd = command_builder::build_mf_cload(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// UL/NTAG: single `hf mfu restore` with special pages + engineering mode.
async fn write_ultralight(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    let cmd = command_builder::build_mfu_restore(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// iCLASS: single `hf iclass restore` with default or recovered key.
async fn write_iclass(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    // Use recovered key for Elite/SE cards, master key for Legacy
    let cmd = if let Some(ref key) = session.get_iclass_key() {
        command_builder::build_iclass_restore_with_key(dump_path, key)
    } else {
        command_builder::build_iclass_restore(dump_path)
    };
    let output = session.run_command(&cmd).await?;
    check_write_output(&output)?;

    finish_write(session, machine).await
}

/// Regular (non-magic) MIFARE Classic: restore data sectors only via `hf mf restore`.
/// Block 0 (UID) is NOT written — only data blocks are restored using the recovered keys.
/// This works on standard Fudan/NXP MIFARE Classic cards that don't support magic commands.
///
/// Uses lenient error checking: block 0 write failures are expected on non-magic cards
/// (block 0 is manufacturer-locked / read-only). Only non-block-0 errors are fatal.
async fn write_regular_mifare(
    session: &Pm3Session,
    dump_path: &str,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 0.3, Some(1), Some(2))?;

    let cmd = command_builder::build_mf_restore(dump_path);
    let output = session.run_command(&cmd).await?;
    check_write_output_regular_mifare(&output)?;

    finish_write(session, machine).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read the first 16 bytes of a binary dump file and return as a 32-char hex string.
/// Used by Gen2 (`wrbl0 --force`) and Gen3 (`gen3blk`) to extract block 0 data.
fn read_block0_from_dump(dump_path: &str) -> Result<String, AppError> {
    let data = std::fs::read(dump_path).map_err(|e| {
        AppError::CommandFailed(format!("Failed to read dump file '{}': {}", dump_path, e))
    })?;

    if data.len() < 16 {
        return Err(AppError::CommandFailed(format!(
            "Dump file too small ({} bytes, need at least 16)",
            data.len()
        )));
    }

    // Convert first 16 bytes to uppercase hex (32 chars)
    Ok(data[..16].iter().map(|b| format!("{:02X}", b)).collect())
}

/// Transition FSM: Writing -> Verifying (write finished).
async fn finish_write(
    session: &Pm3Session,
    machine: &State<'_, Mutex<WizardMachine>>,
) -> Result<WizardState, AppError> {
    update_write_progress(session.app(), machine, 1.0, None, None)?;

    let mut m = machine.lock().map_err(|e| {
        AppError::CommandFailed(format!("State lock poisoned: {}", e))
    })?;
    m.transition(WizardAction::WriteFinished)?;
    Ok(m.current.clone())
}

/// Emit write progress and update FSM.
fn update_write_progress(
    app: &AppHandle,
    machine: &State<'_, Mutex<WizardMachine>>,
    progress: f32,
    current_step: Option<u16>,
    total_steps: Option<u16>,
) -> Result<(), AppError> {
    let mut m = machine.lock().map_err(|e| {
        AppError::CommandFailed(format!("State lock poisoned: {}", e))
    })?;
    m.transition(WizardAction::UpdateWriteProgress {
        progress,
        current_block: current_step,
        total_blocks: total_steps,
    })?;
    let _ = app.emit(
        "write-progress",
        serde_json::json!({
            "progress": progress,
            "current_block": current_step,
            "total_blocks": total_steps,
        }),
    );
    Ok(())
}

/// Check PM3 write output for critical errors (`[!!]`).
fn check_write_output(output: &str) -> Result<(), AppError> {
    if output.contains("[!!]") {
        // Extract the error line for diagnostics
        let err_line = output
            .lines()
            .find(|l| l.contains("[!!]"))
            .unwrap_or("Unknown error");
        return Err(AppError::CommandFailed(format!(
            "PM3 write error: {}",
            err_line.trim()
        )));
    }
    Ok(())
}

/// Lenient error check for RegularMifare writes.
/// Block 0 write failures are expected on non-magic cards (manufacturer-locked).
/// Only treats non-block-0 `[!!]` errors as fatal.
fn check_write_output_regular_mifare(output: &str) -> Result<(), AppError> {
    for line in output.lines() {
        if line.contains("[!!]") {
            let lower = line.to_lowercase();
            // Tolerate block 0 / sector 0 write failures (expected on regular MIFARE)
            if lower.contains("block 0") || lower.contains("block 00") || lower.contains("blk 0") {
                continue;
            }
            return Err(AppError::CommandFailed(format!(
                "PM3 write error: {}",
                line.trim()
            )));
        }
    }
    Ok(())
}

/// Report an error via FSM transition and return the resulting state.
fn report_error(
    machine: &State<'_, Mutex<WizardMachine>>,
    message: &str,
    user_message: &str,
    recoverable: bool,
    recovery_action: Option<RecoveryAction>,
) -> Result<WizardState, AppError> {
    let mut m = machine.lock().map_err(|e| {
        AppError::CommandFailed(format!("State lock poisoned: {}", e))
    })?;
    m.transition(WizardAction::ReportError {
        message: message.to_string(),
        user_message: user_message.to_string(),
        recoverable,
        recovery_action,
    })?;
    Ok(m.current.clone())
}

// ---------------------------------------------------------------------------
// HF Verification — read back + compare
// ---------------------------------------------------------------------------

/// Verify an HF clone by reading back the card and comparing with the source.
///
/// Strategy:
/// 1. `hf search` — confirm card responds, extract UID
/// 2. UID comparison with source (primary check)
/// 3. Readback via type-appropriate command (cview for Gen1a, dump for others)
/// 4. Dump file comparison if both original and readback files are available
///
/// Transitions: Verifying -> VerificationComplete.
#[tauri::command]
pub async fn hf_verify_clone(
    source_uid: String,
    _card_type: CardType,
    blank_type: BlankType,
    machine: State<'_, Mutex<WizardMachine>>,
    session: State<'_, Pm3Session>,
) -> Result<WizardState, AppError> {
    // Guard: must be in Verifying state
    {
        let m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        match &m.current {
            WizardState::Verifying => {}
            other => {
                return Err(AppError::InvalidTransition(format!(
                    "Must be in Verifying state to verify clone, currently in {:?}",
                    std::mem::discriminant(other)
                )));
            }
        }
    };

    // Step 1: hf search — confirm card responds and extract UID
    let search_output =
        session.run_command(command_builder::build_hf_search()).await;

    // RegularMifare: skip UID check (can't write block 0 on non-magic cards)
    let skip_uid_check = matches!(blank_type, BlankType::RegularMifare);

    let uid_match = if skip_uid_check {
        // Just confirm the card is present
        match &search_output {
            Ok(output) => output_parser::parse_hf_search(output).is_some(),
            Err(_) => false,
        }
    } else {
        match &search_output {
            Ok(output) => {
                if let Some((_, card_data)) = output_parser::parse_hf_search(output) {
                    let clean_source: String = source_uid
                        .chars()
                        .filter(|c| c.is_ascii_hexdigit())
                        .collect::<String>()
                        .to_uppercase();
                    let clean_detected: String = card_data
                        .uid
                        .chars()
                        .filter(|c| c.is_ascii_hexdigit())
                        .collect::<String>()
                        .to_uppercase();
                    clean_source == clean_detected
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    };

    if !uid_match {
        let mut m = machine.lock().map_err(|e| {
            AppError::CommandFailed(format!("State lock poisoned: {}", e))
        })?;
        m.transition(WizardAction::VerificationResult {
            success: false,
            mismatched_blocks: vec![0], // block 0 = UID mismatch sentinel
        })?;
        return Ok(m.current.clone());
    }

    // Step 2: Deeper readback verification by blank type
    let mismatched_blocks = match blank_type {
        BlankType::MagicMifareGen1a => {
            // Gen1a: read all blocks via backdoor (no keys needed)
            verify_readback(
                session.inner(),
                command_builder::build_mf_cview(),
                16,
            )
            .await
        }
        BlankType::MagicMifareGen2
        | BlankType::MagicMifareGen3
        | BlankType::MagicMifareGen4GTU
        | BlankType::MagicMifareGen4GDM => {
            // Gen2/Gen3/Gen4: read back using recovered keys
            verify_readback(
                session.inner(),
                command_builder::build_mf_dump(),
                16,
            )
            .await
        }
        BlankType::MagicUltralight => {
            // UL/NTAG: dump pages and compare
            verify_readback(
                session.inner(),
                command_builder::build_mfu_dump(),
                4,
            )
            .await
        }
        BlankType::IClassBlank => {
            // iCLASS: dump blocks and compare (use stored key if Elite)
            let cmd = if let Some(ref key) = session.get_iclass_key() {
                command_builder::build_iclass_dump_with_key(key)
            } else {
                command_builder::build_iclass_dump().to_string()
            };
            verify_readback(session.inner(), &cmd, 8).await
        }
        BlankType::RegularMifare => {
            // Regular MIFARE: read back using recovered keys, same as Gen2+
            verify_readback(
                session.inner(),
                command_builder::build_mf_dump(),
                16,
            )
            .await
        }
        _ => vec![],
    };

    let success = mismatched_blocks.is_empty();

    let mut m = machine.lock().map_err(|e| {
        AppError::CommandFailed(format!("State lock poisoned: {}", e))
    })?;
    m.transition(WizardAction::VerificationResult {
        success,
        mismatched_blocks,
    })?;
    Ok(m.current.clone())
}

/// Run a readback command and optionally compare the resulting dump with the original.
/// Returns empty vec on success, vec of mismatched block indices on failure.
/// Readback errors are non-fatal — UID already matched as the primary check.
async fn verify_readback(
    session: &Pm3Session,
    readback_cmd: &str,
    block_size: usize,
) -> Vec<u16> {
    let output = match session.run_command(readback_cmd).await {
        Ok(o) => o,
        Err(_) => return vec![], // Readback failed, fall back to UID-only
    };

    // Check for critical PM3 errors
    if output.contains("[!!]") {
        return vec![0];
    }

    // Try dump file comparison if both original and readback files are available
    let readback_path = output_parser::extract_dump_file_path(&output);
    let original_path = session.get_dump_path();

    match (original_path, readback_path) {
        (Some(ref orig), Some(ref readback)) => {
            compare_dump_files(orig, readback, block_size)
        }
        _ => vec![], // No files to compare, UID matched = success
    }
}

/// Compare two binary dump files block by block.
/// Returns mismatched block indices (empty = all blocks match).
fn compare_dump_files(original: &str, readback: &str, block_size: usize) -> Vec<u16> {
    let orig_data = match std::fs::read(original) {
        Ok(d) => d,
        Err(_) => return vec![],
    };
    let readback_data = match std::fs::read(readback) {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    if orig_data.is_empty() || readback_data.is_empty() || block_size == 0 {
        return vec![];
    }

    let compare_len = orig_data.len().min(readback_data.len());
    let blocks = compare_len / block_size;
    let mut mismatched = Vec::new();

    for i in 0..blocks {
        let start = i * block_size;
        let end = start + block_size;
        if orig_data[start..end] != readback_data[start..end] {
            mismatched.push(i as u16);
        }
    }

    mismatched
}

// ---------------------------------------------------------------------------
// iCLASS Elite key recovery (loclass attack)
// ---------------------------------------------------------------------------

/// Step 1: Simulate an iCLASS tag at a real reader to collect MAC traces.
/// The user must physically present the PM3 at the door reader.
/// Collects authentication traces needed for the loclass key recovery attack.
///
/// Returns a status message indicating how many MACs were collected.
#[tauri::command]
pub async fn iclass_collect_macs(
    session: State<'_, Pm3Session>,
) -> Result<String, AppError> {
    let output = session
        .run_command(command_builder::build_iclass_sim_collect())
        .await?;

    // Count collected MACs from output
    let mac_count = output
        .lines()
        .filter(|l| l.contains("[+]") && l.to_lowercase().contains("mac"))
        .count();

    if mac_count > 0 {
        Ok(format!("Collected {} MAC trace(s). Ready for key recovery.", mac_count))
    } else if output.contains("[+]") {
        Ok("Simulation complete. MAC traces collected.".to_string())
    } else {
        Err(AppError::CommandFailed(
            "No MAC traces collected. Present the PM3 at the reader and try again.".into(),
        ))
    }
}

/// Step 2: Run loclass attack to recover the diversified key from collected MACs.
/// Must call `iclass_collect_macs` first.
///
/// On success, stores the recovered key in the session for use by dump/write commands.
#[tauri::command]
pub async fn iclass_loclass_recover(
    session: State<'_, Pm3Session>,
) -> Result<String, AppError> {
    let output = session
        .run_command(command_builder::build_iclass_loclass())
        .await?;

    if let Some(key) = output_parser::parse_iclass_loclass_key(&output) {
        session.set_iclass_key(Some(key.clone()));
        Ok(format!("Key recovered: {}. Ready to dump/clone.", key))
    } else if output.contains("[!!]") || output.to_lowercase().contains("error") {
        Err(AppError::CommandFailed(
            "Loclass attack failed. Collect more MAC traces and try again.".into(),
        ))
    } else {
        Err(AppError::CommandFailed(
            "Could not extract key from loclass output. Collect more MAC traces and try again."
                .into(),
        ))
    }
}
