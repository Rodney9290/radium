use async_trait::async_trait;

use crate::error::AppError;
use crate::pm3::transport::Pm3Transport;
use crate::pm3::types::OutputLine;

// ---------------------------------------------------------------------------
// MockTransport
// ---------------------------------------------------------------------------

/// Mock PM3 transport for development/testing without real hardware.
///
/// Returns realistic PM3 output for all commands the app sends.
/// Activated via the `PM3_MOCK=1` environment variable or the
/// `connect_mock_device` Tauri command.
///
/// Card scenario is controlled by `PM3_MOCK_CARD` env var (default: `em4100`).
/// Supported scenarios:
///   em4100 | hid | indala | mifare1k | mifare4k | ultralight | ntag | desfire | iclass
///   mifare_ev1 | fudan | mifare_static
pub struct MockTransport {
    scenario: String,
}

impl MockTransport {
    pub fn new(scenario: &str) -> Self {
        Self {
            scenario: scenario.to_string(),
        }
    }

    fn respond(&self, cmd: &str) -> String {
        let cmd = cmd.trim();

        if cmd == "hw version" {
            return HW_VERSION.to_string();
        }
        if cmd == "hw tune" {
            return HW_TUNE.to_string();
        }
        if cmd == "lf search" {
            return self.lf_search();
        }
        if cmd == "hf search" {
            return self.hf_search();
        }
        if cmd == "hf 14a info" {
            return self.hf_14a_info();
        }
        if cmd == "hf mf info" {
            return self.hf_mf_info();
        }
        if cmd == "hf mfu info" {
            return self.hf_mfu_info();
        }
        if cmd == "hf iclass info" {
            return HF_ICLASS_INFO.to_string();
        }
        if cmd == "lf t55xx detect" {
            return LF_T55XX_DETECT.to_string();
        }
        if cmd == "lf t55xx chk" {
            return LF_T55XX_CHK.to_string();
        }
        if cmd.starts_with("lf t55xx wipe") {
            return LF_T55XX_WIPE.to_string();
        }
        if cmd == "lf em 4x05 info" {
            return LF_EM4305_INFO.to_string();
        }
        if cmd == "lf em 4x05 wipe" {
            return LF_EM4305_WIPE.to_string();
        }
        if cmd.starts_with("lf em 4x05 read") {
            return LF_EM4305_READ.to_string();
        }
        // LF clone commands
        if cmd.starts_with("lf em 410x clone")
            || cmd.starts_with("lf hid clone")
            || cmd.starts_with("lf indala clone")
            || cmd.starts_with("lf io clone")
            || cmd.starts_with("lf awid clone")
            || cmd.starts_with("lf fdxb clone")
            || cmd.starts_with("lf paradox clone")
            || cmd.starts_with("lf viking clone")
            || cmd.starts_with("lf pyramid clone")
            || cmd.starts_with("lf keri clone")
            || cmd.starts_with("lf nexwatch clone")
            || cmd.starts_with("lf presco clone")
            || cmd.starts_with("lf nedap clone")
            || cmd.starts_with("lf gproxii clone")
            || cmd.starts_with("lf gallagher clone")
            || cmd.starts_with("lf pac clone")
            || cmd.starts_with("lf noralsy clone")
            || cmd.starts_with("lf jablotron clone")
            || cmd.starts_with("lf securakey clone")
            || cmd.starts_with("lf visa2000 clone")
            || cmd.starts_with("lf motorola clone")
            || cmd.starts_with("lf idteck clone")
        {
            return LF_CLONE_SUCCESS.to_string();
        }
        // FM11RF08S hardware backdoor key check
        if cmd.starts_with("hf mf chk") && cmd.contains("A396EFA4E24F") {
            return self.hf_mf_backdoor_chk();
        }
        // HF autopwn (streaming)
        if cmd.starts_with("hf mf autopwn") {
            return self.hf_autopwn();
        }
        // HF write / config commands
        if cmd.starts_with("hf mf cload")
            || cmd.starts_with("hf mf restore")
            || cmd.starts_with("hf mf gload")
            || cmd.starts_with("hf mf wrbl")
            || cmd.starts_with("hf 14a config")
            || cmd.starts_with("hf mf gen3uid")
            || cmd.starts_with("hf mf gen3blk")
            || cmd.starts_with("hf mf gdmsetblk")
        {
            return HF_WRITE_OK.to_string();
        }
        if cmd.starts_with("hf mfu restore") {
            return HF_MFU_RESTORE_OK.to_string();
        }
        if cmd.starts_with("hf iclass restore") || cmd.starts_with("hf iclass dump") {
            return HF_ICLASS_OK.to_string();
        }
        // HF verification reads
        if cmd == "hf mf cview" {
            return HF_MF_CVIEW.to_string();
        }
        if cmd == "hf mf dump" {
            return HF_MF_DUMP.to_string();
        }
        if cmd == "hf mfu dump" {
            return HF_MFU_DUMP.to_string();
        }
        if cmd.starts_with("hf mf cgetblk") || cmd.starts_with("hf mf rdbl") {
            return HF_RDBL.to_string();
        }
        if cmd == "hf mf erase" {
            return HF_MF_ERASE_OK.to_string();
        }

        format!("[=] [mock] unrecognized command: {}", cmd)
    }

    fn lf_search(&self) -> String {
        match self.scenario.as_str() {
            "em4100" => LF_SEARCH_EM4100.to_string(),
            "hid" => LF_SEARCH_HID.to_string(),
            "indala" => LF_SEARCH_INDALA.to_string(),
            // HF-only cards return no LF hit
            _ => LF_SEARCH_NONE.to_string(),
        }
    }

    fn hf_search(&self) -> String {
        match self.scenario.as_str() {
            "mifare1k" => HF_SEARCH_MIFARE1K.to_string(),
            "mifare4k" => HF_SEARCH_MIFARE4K.to_string(),
            "ultralight" => HF_SEARCH_ULTRALIGHT.to_string(),
            "ntag" => HF_SEARCH_NTAG.to_string(),
            "desfire" => HF_SEARCH_DESFIRE.to_string(),
            "iclass" => HF_SEARCH_ICLASS.to_string(),
            "mifare_ev1" => HF_SEARCH_MIFARE_EV1.to_string(),
            "fudan" => HF_SEARCH_FUDAN.to_string(),
            "mifare_static" => HF_SEARCH_MIFARE_STATIC.to_string(),
            _ => HF_SEARCH_NONE.to_string(),
        }
    }

    fn hf_14a_info(&self) -> String {
        match self.scenario.as_str() {
            "mifare1k" | "mifare4k" => HF_14A_INFO_MIFARE.to_string(),
            "ultralight" | "ntag" => HF_14A_INFO_UL.to_string(),
            "mifare_ev1" => HF_14A_INFO_EV1.to_string(),
            "fudan" => HF_14A_INFO_FUDAN.to_string(),
            "mifare_static" => HF_14A_INFO_STATIC.to_string(),
            _ => HF_14A_INFO_GENERIC.to_string(),
        }
    }

    fn hf_mfu_info(&self) -> String {
        match self.scenario.as_str() {
            "ntag" => HF_MFU_INFO_NTAG.to_string(),
            _ => HF_MFU_INFO_UL.to_string(),
        }
    }

    fn hf_mf_info(&self) -> String {
        match self.scenario.as_str() {
            "mifare_ev1" => HF_MF_INFO_EV1.to_string(),
            "fudan" => HF_MF_INFO_FUDAN.to_string(),
            "mifare_static" => HF_MF_INFO_STATIC.to_string(),
            _ => HF_MF_INFO.to_string(),
        }
    }

    fn hf_autopwn(&self) -> String {
        match self.scenario.as_str() {
            "mifare_ev1" => HF_AUTOPWN_HARDNESTED.to_string(),
            "fudan" => HF_AUTOPWN_BACKDOOR.to_string(),
            "mifare_static" => HF_AUTOPWN_STATICNESTED.to_string(),
            _ => HF_AUTOPWN.to_string(),
        }
    }

    fn hf_mf_backdoor_chk(&self) -> String {
        match self.scenario.as_str() {
            "fudan" => HF_MF_BACKDOOR_CHK_HIT.to_string(),
            _ => HF_MF_BACKDOOR_CHK_MISS.to_string(),
        }
    }
}

#[async_trait]
impl Pm3Transport for MockTransport {
    async fn send(&self, cmd: &str) -> Result<String, AppError> {
        // Simulate a brief hardware round-trip
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        Ok(self.respond(cmd))
    }

    async fn send_streaming(
        &self,
        cmd: &str,
        _timeout_secs: u64,
        mut on_line: Box<dyn FnMut(OutputLine) + Send>,
    ) -> Result<String, AppError> {
        let response = self.respond(cmd);
        for line in response.lines() {
            tokio::time::sleep(std::time::Duration::from_millis(40)).await;
            let text = line.trim().to_string();
            if !text.is_empty() {
                on_line(OutputLine {
                    text,
                    is_error: false,
                });
            }
        }
        Ok(response)
    }

    async fn is_alive(&self) -> bool {
        true
    }

    fn cancel(&self) -> Result<(), AppError> {
        Ok(())
    }

    async fn close(&self) -> Result<(), AppError> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Canned responses — hw version
// ---------------------------------------------------------------------------

const HW_TUNE: &str = r#"
[=] Measuring antenna characteristics, please wait...
[=] You can cancel with pressing the pm3 button

[=] LF antenna: 47.36 V @ 125.00 kHz
[=] LF antenna: 20.12 V @ 134.00 kHz
[=] LF optimal: 125.00 kHz

[=] HF antenna: 28.13 V @ 13.56 MHz

[+] Looks like your LF antenna is 125/134 kHz
[+] Looks like your HF antenna is 13.56 MHz
"#;

const HW_VERSION: &str = r#"
 [ Proxmark3 RFID instrument ]

 [ Client ]
  client: Iceman/master/v4.20728-234-g1a2b3c4d5

 [ ARM ]
  os: Iceman/master/v4.20728-234-g1a2b3c4d5

 [ FPGA ]
  LF image built for 2s30vq100 on 2024-01-15 at 10:30:00
  HF image built for 2s30vq100 on 2024-01-15 at 10:30:00

 [ Hardware ]
  --= uC: AT91SAM7S512 Rev B
  --= Embedded flash memory 512K bytes ( 40% used )

[=] [mock] Simulated Proxmark3 Easy
"#;

// ---------------------------------------------------------------------------
// Canned responses — LF search
// ---------------------------------------------------------------------------

const LF_SEARCH_EM4100: &str = r#"
[=] Searching for EM410x tag...

[+] EM 410x ID  0102030405
[+] EM 410x ( RF/64 )

[+] Valid EM410x ID found!
"#;

const LF_SEARCH_HID: &str = r#"
[=] Searching for HID tag...

[+] HID Prox ID: 200078BE5E1E
[+] FC: 65 CN: 29334 (26 Bit)
[=] raw: 200078BE5E1E

[+] Valid HID Prox ID found!
"#;

const LF_SEARCH_INDALA: &str = r#"
[=] Searching for Indala tag...

[+] Indala Prox ID: 4000000001234567
[+] Indala Raw: 4000000001234567

[+] Valid Indala ID found!
"#;

const LF_SEARCH_NONE: &str = r#"
[=] Searching for EM410x tag... No data found!
[=] Searching for HID tag... No data found!
[=] Searching for Indala tag... No data found!

[!!] No known 125/134 kHz tags found!
"#;

// ---------------------------------------------------------------------------
// Canned responses — HF search
// ---------------------------------------------------------------------------

const HF_SEARCH_MIFARE1K: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: DE AD BE EF
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] Possible types:
[+]    MIFARE Classic 1K

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_MIFARE4K: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: CA FE BA BE
[+] ATQA: 00 02
[+] SAK: 18 [2]
[+] Possible types:
[+]    MIFARE Classic 4K

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_ULTRALIGHT: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: 04 11 22 33 44 55 66
[+] ATQA: 00 44
[+] SAK: 00 [2]
[+] Possible types:
[+]    MIFARE Ultralight

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_NTAG: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: 04 AB CD EF 12 34 56
[+] ATQA: 00 44
[+] SAK: 00 [2]
[+] Possible types:
[+]    NTAG 213

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_DESFIRE: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: 04 11 22 33 44 55 66
[+] ATQA: 03 44
[+] SAK: 20 [2]
[+] Possible types:
[+]    MIFARE DESFire EV1

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_ICLASS: &str = r#"
[=] Searching for iCLASS / Picopass tag...

[+] iCLASS / Picopass tag found
[+] CSN: 01 02 03 04 05 06 07 08

[+] Valid iCLASS tag found!
"#;

const HF_SEARCH_NONE: &str = r#"
[=] Searching for ISO 14443-A tag... No data found!
[=] Searching for ISO 14443-B tag... No data found!
[=] Searching for iCLASS / Picopass tag... No data found!

[!!] No known/supported 13.56 MHz tags found!
"#;

// ---------------------------------------------------------------------------
// Canned responses — HF info commands
// ---------------------------------------------------------------------------

const HF_14A_INFO_MIFARE: &str = r#"
[+] UID: DE AD BE EF
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] ATS: n/a
[+] Prng detection: WEAK
"#;

const HF_14A_INFO_UL: &str = r#"
[+] UID: 04 11 22 33 44 55 66
[+] ATQA: 00 44
[+] SAK: 00 [2]
[+] ATS: n/a
"#;

const HF_14A_INFO_GENERIC: &str = r#"
[+] UID: 01 02 03 04
[+] ATQA: 00 04
[+] SAK: 08 [2]
"#;

const HF_MF_INFO: &str = r#"
[+] Magic capabilities: Gen 1a
[+] Magic wakeup: 40/43
"#;

const HF_MFU_INFO_UL: &str = r#"
[+] --- Tag Information ---
[+] MIFARE Ultralight EV1
[+] UID: 04 11 22 33 44 55 66
"#;

const HF_MFU_INFO_NTAG: &str = r#"
[+] --- Tag Information ---
[+] NTAG213
[+] UID: 04 AB CD EF 12 34 56
"#;

const HF_ICLASS_INFO: &str = r#"
[+] iCLASS / Picopass tag present
[+] CSN: 01 02 03 04 05 06 07 08
"#;

// ---------------------------------------------------------------------------
// Canned responses — T5577 / EM4305 blank commands
// ---------------------------------------------------------------------------

const LF_T55XX_DETECT: &str = r#"
[=] Chip type......... T55x7
[=] Modulation........ ASK
[=] Bit rate.......... RF/64
[=] Inverted.......... No
[=] Offset............ 33
[=] Seq. terminator... Yes
[=] Block0............ 00070040
[=] Downlink mode..... default/fixed bit length
[=] Password set...... No

[+] Chip detected!
"#;

const LF_T55XX_CHK: &str = r#"
[=] Checking passwords...
[=] Trying 1000 passwords...
[!!] No password found (chip is unlocked)
"#;

const LF_T55XX_WIPE: &str = r#"
[=] Wiping T55xx tag...
[+] Writing 0x00000000 to block 0
[+] Writing 0x00000000 to block 1
[+] Writing 0x00000000 to block 2
[+] Writing 0x00000000 to block 3
[+] Writing 0x00000000 to block 4
[+] Writing 0x00000000 to block 5
[+] Writing 0x00000000 to block 6
[+] Writing 0x00000000 to block 7
[+] T55xx card wiped successfully
"#;

const LF_EM4305_INFO: &str = r#"
[+] EM4305 found
[=] Reading chip...
[+] Block 0 data: 00000000
[+] Block 1 data: 00000000
[+] Block 2 data: 00000000
[+] Block 3 data: 00000000
[+] Block 4 data: 00000000
"#;

const LF_EM4305_WIPE: &str = r#"
[=] Wiping EM4305 chip...
[+] Writing default config to block 4...
[+] EM4305 wiped successfully
"#;

const LF_EM4305_READ: &str = r#"
[+] Word[0]: 00000000
"#;

// ---------------------------------------------------------------------------
// Canned responses — LF clone
// ---------------------------------------------------------------------------

const LF_CLONE_SUCCESS: &str = r#"
[=] Writing to T55x7 tag...
[+] Done
[+] Card successfully cloned!
"#;

// ---------------------------------------------------------------------------
// Canned responses — HF write / clone
// ---------------------------------------------------------------------------

const HF_WRITE_OK: &str = r#"
[+] Done
[+] Write successful
"#;

const HF_MFU_RESTORE_OK: &str = r#"
[=] Restoring dump to MIFARE Ultralight tag...
[+] Restoring 48 pages
[+] Done
[+] UL/NTAG restore successful
"#;

const HF_ICLASS_OK: &str = r#"
[=] iCLASS operation complete
[+] Done
"#;

// ---------------------------------------------------------------------------
// Canned responses — HF autopwn (streaming)
// ---------------------------------------------------------------------------

const HF_AUTOPWN: &str = r#"
[=] Running hf mf autopwn against MIFARE Classic 1K...
[=] Trying default dictionary keys...
[+] found valid key [ FFFFFFFFFFFF ]
[+] found 1/32 keys (D)
[+] found valid key [ 000000000000 ]
[+] found 2/32 keys (D)
[=] Nested attack...
[+] found valid key [ A0A1A2A3A4A5 ]
[+] found 16/32 keys (D)
[+] found 32/32 keys (D)
[+] Succeeded in dumping all blocks
[+] saved 64 blocks to file hf-mf-DEADBEEF-dump.bin
[=] autopwn execution time: 12 seconds
"#;

// ---------------------------------------------------------------------------
// Canned responses — HF verification reads
// ---------------------------------------------------------------------------

const HF_MF_CVIEW: &str = r#"
[=] Reading all 64 blocks via magic wakeup...
[+] Block 0: DEADBEEF04080400000000000000BEEF
[+] Block 1: 00000000000000000000000000000000
[+] Block 63: FFFFFFFFFFFF08778F00FFFFFFFFFFFF
[+] Done
"#;

const HF_MF_DUMP: &str = r#"
[=] Dumping MIFARE Classic 1K...
[+] saved 64 blocks to file hf-mf-DEADBEEF-dump.bin
"#;

const HF_MFU_DUMP: &str = r#"
[=] Dumping MIFARE Ultralight...
[+] saved to binary file hf-mfu-0411223344556-dump.bin
"#;

const HF_RDBL: &str = r#"
[+] Block 1: 00000000000000000000000000000000
"#;

const HF_MF_ERASE_OK: &str = r#"
[=] Erasing all sectors of MIFARE Classic card...
[=] Using default key FFFFFFFFFFFF for all sectors
[+] Sector  0 erased
[+] Sector  1 erased
[+] Sector  2 erased
[+] Sector  3 erased
[+] Sector  4 erased
[+] Sector  5 erased
[+] Sector  6 erased
[+] Sector  7 erased
[+] Sector  8 erased
[+] Sector  9 erased
[+] Sector 10 erased
[+] Sector 11 erased
[+] Sector 12 erased
[+] Sector 13 erased
[+] Sector 14 erased
[+] Sector 15 erased
[+] Card erased successfully
"#;

// ---------------------------------------------------------------------------
// Canned responses — advanced scenarios (EV1 / Fudan / Static nonce)
// ---------------------------------------------------------------------------

const HF_SEARCH_MIFARE_EV1: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: E1 23 45 67
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] Possible types:
[+]    MIFARE Classic EV1 1K

[+] Prng detection: HARDENED

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_FUDAN: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: A3 96 EF A4
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] Possible types:
[+]    MIFARE Classic 1K

[+] Prng detection: STATIC

[+] Valid ISO 14443-A tag found!
"#;

const HF_SEARCH_MIFARE_STATIC: &str = r#"
[=] Searching for ISO 14443-A tag...

[+] UID: 5A 1C 3F B2
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] Possible types:
[+]    MIFARE Classic 1K

[+] Prng detection: STATIC

[+] Valid ISO 14443-A tag found!
"#;

const HF_14A_INFO_EV1: &str = r#"
[+] UID: E1 23 45 67
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] ATS: n/a
[+] Prng detection: HARDENED
[=] No magic capabilities detected
"#;

const HF_14A_INFO_FUDAN: &str = r#"
[+] UID: A3 96 EF A4
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] ATS: n/a
[+] Prng detection: STATIC
[=] Fudan FM11RF08S chip detected
[=] Hardware backdoor key attack may apply (Quarkslab 2024)
"#;

const HF_14A_INFO_STATIC: &str = r#"
[+] UID: 5A 1C 3F B2
[+] ATQA: 00 04
[+] SAK: 08 [2]
[+] ATS: n/a
[+] Prng detection: STATIC
[=] Static nonce — staticnested attack applicable
"#;

const HF_MF_INFO_EV1: &str = r#"
[=] MIFARE Classic EV1 — hardened PRNG, no magic capabilities
[+] Sector 0: key A recovered (FFFFFFFFFFFF)
"#;

const HF_MF_INFO_FUDAN: &str = r#"
[=] Fudan FM11RF08S detected — static nonce PRNG
[=] Checking hardware backdoor key A396EFA4E24F...
[+] Backdoor key VALID — full sector access granted
"#;

const HF_MF_INFO_STATIC: &str = r#"
[=] Static nonce card detected — PRNG: STATIC
[=] No magic capabilities
"#;

// ---------------------------------------------------------------------------
// Autopwn variants for advanced attack scenarios
// ---------------------------------------------------------------------------

const HF_AUTOPWN_HARDNESTED: &str = r#"
[=] Running hf mf autopwn against MIFARE Classic 1K...
[=] Trying default dictionary keys...
[+] found valid key [ FFFFFFFFFFFF ]
[+] found 1/32 keys (D)
[=] Darkside attack...
[=] Nested attack...
[=] Prng: HARDENED — falling back to Hardnested attack
[=] Hardnested attack (SIMD accelerated)...
[=] using SIMD intrinsics (AVX2)
[=] iterations: 4096 / 65536 states tested...
[=] iterations: 16384 / 65536 states tested...
[=] iterations: 32768 / 65536 states tested...
[+] found valid key [ A0B1C2D3E4F5 ]
[+] found 8/32 keys (D)
[=] Nested attack using recovered keys...
[+] found valid key [ 001122334455 ]
[+] found 16/32 keys (D)
[+] found 24/32 keys (D)
[+] found 32/32 keys (D)
[+] Succeeded in dumping all blocks
[+] saved 64 blocks to file hf-mf-E1234567-dump.bin
[=] autopwn execution time: 47 seconds
"#;

const HF_AUTOPWN_STATICNESTED: &str = r#"
[=] Running hf mf autopwn against MIFARE Classic 1K...
[=] Trying default dictionary keys...
[+] found valid key [ FFFFFFFFFFFF ]
[+] found 1/32 keys (D)
[=] Nested attack...
[=] Static nonce detected — switching to Staticnested attack
[=] Staticnested attack...
[=] collecting nonces for sector 1...
[=] collecting nonces for sector 2...
[=] solving...
[+] found valid key [ 4B5C6D7E8F90 ]
[+] found 16/32 keys (D)
[+] found 24/32 keys (D)
[+] found 32/32 keys (D)
[+] Succeeded in dumping all blocks
[+] saved 64 blocks to file hf-mf-5A1C3FB2-dump.bin
[=] autopwn execution time: 8 seconds
"#;

const HF_AUTOPWN_BACKDOOR: &str = r#"
[=] Running hf mf autopwn against MIFARE Classic 1K (FM11RF08S)...
[=] Checking for FM11RF08S hardware backdoor keys...
[=] Probing backdoor key A396EFA4E24F (Quarkslab 2024)...
[+] found valid key [ A396EFA4E24F ]
[+] FM11RF08S hardware backdoor authenticated!
[+] found 32/32 keys (D)
[+] Succeeded in dumping all blocks
[+] saved 64 blocks to file hf-mf-A396EFA4-dump.bin
[=] autopwn execution time: 3 seconds
"#;

// ---------------------------------------------------------------------------
// FM11RF08S hardware backdoor key check
// ---------------------------------------------------------------------------

const HF_MF_BACKDOOR_CHK_HIT: &str = r#"
[=] Checking key A396EFA4E24F against all sectors...
[+] Key A396EFA4E24F found valid for sector 0 key A
[+] Key A396EFA4E24F found valid for sector 1 key A
[+] Key A396EFA4E24F found valid for all sectors
[+] FM11RF08S hardware backdoor key confirmed
"#;

const HF_MF_BACKDOOR_CHK_MISS: &str = r#"
[=] Checking key A396EFA4E24F against all sectors...
[!!] Key A396EFA4E24F not valid for any sector
[=] Card is not FM11RF08S or backdoor has been patched
"#;
