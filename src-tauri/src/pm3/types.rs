use serde::Serialize;
use std::collections::HashMap;

use crate::cards::types::{BlankType, CardData, CardType};

// ---------------------------------------------------------------------------
// Actions — structured command requests to the PM3 device
// ---------------------------------------------------------------------------

/// A structured command request replacing raw CLI string construction.
/// Each variant maps to one or more PM3 CLI commands.
#[derive(Debug, Clone)]
pub enum Action {
    // Device
    GetDeviceInfo,

    // LF operations
    LfSearch,
    T5577Detect,
    T5577Chk,
    T5577Wipe { password: Option<String> },
    Em4305Info,
    Em4305Wipe,
    Em4305ReadWord { word: u8 },
    LfClone {
        card_type: CardType,
        uid: String,
        decoded: HashMap<String, String>,
        blank_type: BlankType,
    },

    // HF operations
    HfSearch,
    Hf14aInfo,
    HfMfInfo,
    HfMfuInfo,
    HfAutopwn { card_type: CardType },
    HfDump { card_type: CardType },
    HfWriteClone {
        blank_type: BlankType,
        dump_path: String,
        source_uid: String,
        card_type: CardType,
    },
    HfVerify {
        blank_type: BlankType,
        source_uid: String,
    },

    // Firmware
    HwVersion,
    FlashFirmware {
        variant: String,
    },

    // Raw passthrough
    RawCommand { cmd: String },
}

// ---------------------------------------------------------------------------
// Events — structured results from PM3 operations
// ---------------------------------------------------------------------------

/// Structured event produced by parsing PM3 output.
/// Replaces raw string parsing at call sites.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    // Device events
    DeviceFound {
        port: String,
        model: String,
        firmware: String,
        hardware_variant: String,
    },
    DeviceNotFound,
    DeviceDisconnected,

    // Card detection
    CardDetected {
        card_type: CardType,
        card_data: CardData,
    },
    NoCardFound,

    // Blank detection
    BlankReady {
        blank_type: BlankType,
        has_existing_data: bool,
    },
    BlankNotFound {
        expected: BlankType,
    },

    // T5577 status
    T5577Status {
        detected: bool,
        password_set: bool,
        chip_type: String,
    },

    // Write progress
    WriteProgress {
        progress: f32,
        step: u16,
        total: u16,
    },
    WriteComplete,
    WriteFailed {
        detail: String,
    },

    // Verification
    VerifyResult {
        success: bool,
        mismatched_blocks: Vec<u16>,
    },

    // HF autopwn progress
    AutopwnProgress {
        phase: String,
        keys_found: u32,
        keys_total: u32,
        elapsed_secs: u32,
    },
    DumpComplete {
        file_path: String,
    },
    DumpPartial {
        file_path: String,
    },

    // Generic output
    CommandOutput {
        text: String,
    },

    // Errors
    Error {
        message: String,
    },

    // Linux-specific
    PermissionDenied {
        device: String,
        reason: String,
    },
}

// ---------------------------------------------------------------------------
// Output line — used by transport streaming callbacks
// ---------------------------------------------------------------------------

/// A single line of output from the PM3 process.
#[derive(Debug, Clone)]
pub struct OutputLine {
    pub text: String,
    pub is_error: bool,
}
