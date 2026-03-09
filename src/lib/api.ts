// Typed Tauri invoke wrappers for PM3 backend commands.

import { invoke } from './tauriSafe';
import type { WizardState, CloneRecord, BlankType, FirmwareCheckResult, DeviceCapabilities } from '../machines/types';

export interface SavedCard {
  id: number | null;
  name: string;
  cardType: string;
  frequency: string;
  uid: string;
  raw: string;
  decoded: string;
  cloneable: boolean;
  recommendedBlank: string;
  createdAt: string;
  notes: string | null;
}

/**
 * Detect connected Proxmark3 device.
 * Triggers hardware scan and returns updated wizard state.
 */
export async function detectDevice(): Promise<WizardState> {
  return invoke<WizardState>('detect_device');
}

/**
 * Connect a simulated PM3 device for testing without hardware.
 * scenario: 'em4100' | 'hid' | 'indala' | 'mifare1k' | 'mifare4k' |
 *           'ultralight' | 'ntag' | 'desfire' | 'iclass'
 */
export async function connectMockDevice(scenario: string = 'em4100'): Promise<WizardState> {
  return invoke<WizardState>('connect_mock_device', { scenario });
}

/**
 * Get cached device capabilities from the active session.
 * Returns platform, features (external flash, smartcard, BT), and version info.
 */
export async function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  return invoke<DeviceCapabilities>('get_device_capabilities');
}

/**
 * Scan a card on the connected device.
 * Identifies card type, frequency, and reads data.
 */
export async function scanCard(): Promise<WizardState> {
  return invoke<WizardState>('scan_card');
}

/**
 * Detect blank card on reader.
 * Runs lf t55xx detect (for T5577) or lf em 4x05 info (for EM4305) on the backend.
 */
export async function detectBlank(port: string): Promise<WizardState> {
  return invoke<WizardState>('detect_blank', { port });
}

/**
 * Execute the clone write operation with full card context.
 * Writes source card data to the blank card.
 */
export async function writeCloneWithData(
  port: string,
  cardType: string,
  uid: string,
  decoded: Record<string, string>,
  blankType?: string,
): Promise<WizardState> {
  return invoke<WizardState>('write_clone_with_data', {
    port,
    cardType,
    uid,
    decoded,
    blankType,
  });
}

/**
 * Verify the written clone against source data.
 * Reads back the blank and compares block-by-block.
 * Pass sourceDecoded to enable field-by-field verification.
 */
export async function verifyCloneWithData(
  port: string,
  sourceUid: string,
  sourceCardType: string,
  sourceDecoded?: Record<string, string>,
  blankType?: string,
): Promise<WizardState> {
  return invoke<WizardState>('verify_clone', {
    port,
    sourceUid,
    sourceCardType,
    sourceDecoded,
    blankType,
  });
}

/**
 * Retrieve clone history from the local database.
 * Returns all past clone operations with metadata.
 */
export async function getHistory(): Promise<CloneRecord[]> {
  return invoke<CloneRecord[]>('get_history');
}

/**
 * Save a clone operation record to the local database.
 * Returns the new record's ID.
 */
export async function saveCloneRecord(record: CloneRecord): Promise<number> {
  return invoke<number>('save_clone_record', { record });
}

/**
 * Delete a single history record by ID.
 */
export async function deleteHistoryRecord(id: number): Promise<void> {
  return invoke<void>('delete_history_record', { id });
}

/**
 * Delete all clone history records.
 */
export async function clearHistory(): Promise<void> {
  return invoke<void>('clear_history');
}

/**
 * Check firmware version match between bundled client and device OS.
 * Returns version info and whether they match.
 */
export async function checkFirmwareVersion(port: string): Promise<FirmwareCheckResult> {
  return invoke<FirmwareCheckResult>('check_firmware_version', { port });
}

/**
 * Start flashing firmware to the connected PM3 device.
 * Returns immediately — progress is streamed via Tauri events:
 * "firmware-progress", "firmware-complete", "firmware-failed"
 */
export async function flashFirmware(port: string, hardwareVariant: string): Promise<void> {
  return invoke<void>('flash_firmware', { port, hardwareVariant });
}

/**
 * Cancel an in-progress firmware flash by killing the child process.
 */
export async function cancelFlash(): Promise<void> {
  return invoke<void>('cancel_flash');
}

// ── Erase (standalone, not wizard FSM) ──────────────────────────

export interface DetectChipResult {
  chipType: string;
  passwordProtected: boolean;
  details: string;
}

export interface WipeResult {
  success: boolean;
  message: string;
}

/**
 * Detect the underlying chip type on the reader (T5577 or EM4305).
 * Independent of the wizard FSM.
 */
export async function detectChip(port: string): Promise<DetectChipResult> {
  return invoke<DetectChipResult>('detect_chip', { port });
}

/**
 * Wipe a chip that was previously detected by detectChip.
 * Independent of the wizard FSM.
 */
export async function wipeChip(port: string, chipType: string): Promise<WipeResult> {
  return invoke<WipeResult>('wipe_chip', { port, chipType });
}

/**
 * Reset the wizard to idle state via wizard_action Reset.
 * Clears all in-progress operation data on the backend.
 */
export async function resetWizard(): Promise<WizardState> {
  return invoke<WizardState>('wizard_action', {
    action: { action: 'Reset' },
  });
}

/**
 * Send ProceedToWrite action to advance Rust FSM from CardIdentified → WaitingForBlank.
 * @param blankType The blank card type selected by the user.
 */
export async function proceedToWrite(blankType: BlankType): Promise<WizardState> {
  return invoke<WizardState>('wizard_action', {
    action: { action: 'ProceedToWrite', payload: { blank_type: blankType } },
  });
}

/**
 * Send MarkComplete action to advance Rust FSM from VerificationComplete → Complete.
 * Requires source and target CardSummary objects.
 */
export async function markComplete(
  source: { card_type: string; uid: string; display_name: string },
  target: { card_type: string; uid: string; display_name: string },
): Promise<WizardState> {
  return invoke<WizardState>('wizard_action', {
    action: { action: 'MarkComplete', payload: { source, target } },
  });
}

// -- HF Clone Operations -----------------------------------------------

/**
 * Run `hf mf autopwn` — key recovery + dump for MIFARE Classic.
 * Long-running (seconds to hours). Progress streamed via `hf-progress` events.
 * Rust handles FSM transitions internally: CardIdentified → HfProcessing → HfDumpReady.
 */
export async function hfAutopwn(): Promise<WizardState> {
  return invoke<WizardState>('hf_autopwn');
}

/**
 * Dump UL/NTAG or iCLASS card memory (no key recovery needed).
 * Fast operation. Rust handles FSM: CardIdentified → HfProcessing → HfDumpReady.
 */
export async function hfDump(): Promise<WizardState> {
  return invoke<WizardState>('hf_dump');
}

/**
 * Write HF clone to magic blank card.
 * Dispatches to the correct write workflow based on blank type.
 */
export async function hfWriteClone(
  sourceUid: string,
  cardType: string,
  blankType: string,
): Promise<WizardState> {
  return invoke<WizardState>('hf_write_clone', { sourceUid, cardType, blankType });
}

/**
 * Verify an HF clone by reading back and comparing with source.
 * 2-layer: UID match (primary) + dump file comparison (secondary).
 */
export async function hfVerifyClone(
  sourceUid: string,
  cardType: string,
  blankType: string,
): Promise<WizardState> {
  return invoke<WizardState>('hf_verify_clone', { sourceUid, cardType, blankType });
}

/**
 * Cancel a running HF operation (kills the child process).
 */
export async function cancelHfOperation(): Promise<void> {
  return invoke<void>('cancel_hf_operation');
}

/**
 * Reveal the HF dump file in the system file manager (Finder/Explorer).
 * Opens the containing folder with the dump file selected.
 */
export async function revealDumpFile(): Promise<void> {
  return invoke<void>('reveal_dump_file');
}

/**
 * Erase all sectors of a MIFARE Classic card back to factory defaults.
 * Resets all keys to FFFFFFFFFFFF and data to 0x00.
 * Returns raw PM3 output.
 */
export async function hfEraseCard(): Promise<string> {
  return invoke<string>('hf_erase_card');
}

// -- Saved Cards -------------------------------------------------------

/**
 * Save a card to the local database for later cloning.
 * Returns the new record's ID.
 */
export async function saveCard(card: {
  name: string;
  cardType: string;
  frequency: string;
  uid: string;
  raw: string;
  decoded: string;
  cloneable: boolean;
  recommendedBlank: string;
  createdAt: string;
  notes?: string | null;
}): Promise<number> {
  return invoke<number>('save_card', { card });
}

/**
 * Retrieve all saved cards from the local database.
 * Ordered by creation date, newest first.
 */
export async function getSavedCards(): Promise<SavedCard[]> {
  return invoke<SavedCard[]>('get_saved_cards');
}

/**
 * Delete a saved card by ID.
 */
export async function deleteSavedCard(id: number): Promise<void> {
  return invoke<void>('delete_saved_card', { id });
}

/**
 * Update the notes for a saved card.
 * Pass null to clear notes.
 */
export async function updateCardNotes(id: number, notes: string | null): Promise<void> {
  return invoke<void>('update_card_notes', { id, notes });
}

// -- Permissions (Linux) -----------------------------------------------

export interface PermissionCheck {
  hasPermission: boolean;
  userInDialout: boolean;
  userInPlugdev: boolean;
  udevRuleInstalled: boolean;
  devicePath: string;
  devicePermissions: string;
  fixCommands: string[];
}

/**
 * Check device permissions (primarily for Linux).
 * Returns structured permission status with fix commands if needed.
 * On non-Linux platforms, returns all-OK.
 */
export async function checkDevicePermissions(devicePath?: string): Promise<PermissionCheck> {
  return invoke<PermissionCheck>('check_device_permissions', { devicePath });
}

// -- Antenna Diagnostics -----------------------------------------------

export interface AntennaResult {
  lfVoltageMv: number | null;
  hfVoltageMv: number | null;
  lfOk: boolean;
  hfOk: boolean;
  rawOutput: string;
}

/**
 * Run `hw tune` to measure LF and HF antenna signal strength.
 * Device must be connected.
 */
export async function hwTune(): Promise<AntennaResult> {
  return invoke<AntennaResult>('hw_tune');
}

// -- Raw PM3 Command ---------------------------------------------------

/**
 * Run an arbitrary PM3 command string on the connected device.
 * Returns raw console output.
 */
export async function runRawCommand(port: string, command: string): Promise<string> {
  return invoke<string>('run_raw_command', { port, command });
}
