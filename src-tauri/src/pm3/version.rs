use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use crate::pm3::output_parser::strip_ansi;

/// Parsed result from `hw version` output — contains client/firmware versions
/// and hardware variant for firmware flash decisions.
#[derive(Debug, Clone, Serialize)]
pub struct HwVersionInfo {
    pub model: String,
    pub client_version: String,
    pub os_version: String,
    /// "rdv4", "rdv4-bt", "generic", or "generic-256"
    pub hardware_variant: String,
    pub versions_match: bool,
    /// LF protocol modules compiled into the firmware (e.g. "EM 4x05/4x69", "HID Prox")
    pub compiled_with_lf: Vec<String>,
    /// HF protocol modules compiled into the firmware (e.g. "ISO 14443A", "iCLASS")
    pub compiled_with_hf: Vec<String>,
}

// ---------------------------------------------------------------------------
// Regexes for parsing `hw version` output
// ---------------------------------------------------------------------------

/// Matches the client version line: `client: Iceman/master/v4.20728-234-g1a2b3c4d5-dirty`
static CLIENT_VERSION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)client\s*:\s*(.+)").expect("bad client version regex")
});

/// Fallback: captures the first non-empty line after `[ Client ]` section header.
/// Real PM3 v4.20728+ outputs version directly without `client:` prefix.
static CLIENT_SECTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[\s*Client\s*\]\s*\n\s*(.+)").expect("bad client section regex")
});

/// Matches the OS (firmware) version line in both formats:
/// - Old: `os: Iceman/master/v4.20725-100-g9876543ab`
/// - Real: `OS......... Iceman/master/v4.20728-358-ga2ba91043-suspect`
static OS_VERSION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?im)^\s*os[\s.:]+(.+)").expect("bad os version regex")
});

/// Extracts commit hash from version string: `v4.20728-234-g1a2b3c4d5-dirty` → `1a2b3c4d5`
static COMMIT_HASH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"-g([0-9a-fA-F]{7,})").expect("bad commit hash regex")
});

/// Extracts bare commit hash from version strings without `-g` prefix.
/// Matches `Iceman/master/d5dc045-suspect` → `d5dc045`
/// The hash appears after the last `/`, is 7+ hex chars, optionally followed by `-dirty`/`-suspect`.
static BARE_COMMIT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"/([0-9a-fA-F]{7,})(?:-(?:dirty|suspect))?(?:\s|$)")
        .expect("bad bare commit regex")
});

/// Extracts base version: `v4.20728` from `Iceman/master/v4.20728-234-g...`
static BASE_VERSION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"v(\d+\.\d+)").expect("bad base version regex")
});

/// Detects AT91SAM7S256 (256K flash variant)
static UC_256K_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)AT91SAM7S256").expect("bad uc 256k regex")
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse the full `hw version` output into structured version info.
///
/// Extracts client version, OS (firmware) version, hardware variant,
/// and whether the two versions match (by commit hash, then base version).
pub fn parse_detailed_hw_version(output: &str) -> HwVersionInfo {
    let clean = strip_ansi(output);

    let model = parse_model(&clean);
    let client_version = CLIENT_VERSION_RE
        .captures(&clean)
        .or_else(|| CLIENT_SECTION_RE.captures(&clean))
        .map(|c| c[1].trim().to_string())
        .unwrap_or_default();
    let os_version = OS_VERSION_RE
        .captures(&clean)
        .map(|c| c[1].trim().to_string())
        .unwrap_or_default();
    let hardware_variant = detect_hardware_variant(&clean);
    let versions_match = compare_versions(&client_version, &os_version);
    let (compiled_with_lf, compiled_with_hf) = parse_compiled_modules(&clean);

    HwVersionInfo {
        model,
        client_version,
        os_version,
        hardware_variant,
        versions_match,
        compiled_with_lf,
        compiled_with_hf,
    }
}

/// Compare two PM3 version strings.
///
/// Strategy:
/// 1. Extract commit hashes (`-gHHHHHHH`). If both present, compare them.
/// 2. Fallback: compare base versions (`v4.NNNNN`).
/// 3. If neither is parseable, return false (mismatch — safer to prompt update).
///
/// Strips `-dirty` and `-suspect` suffixes before comparing.
pub fn compare_versions(client_ver: &str, os_ver: &str) -> bool {
    // Both empty = can't determine → mismatch
    if client_ver.is_empty() || os_ver.is_empty() {
        return false;
    }

    // Primary: compare commit hashes
    let client_commit = extract_commit_hash(client_ver);
    let os_commit = extract_commit_hash(os_ver);

    if let (Some(ref cc), Some(ref oc)) = (client_commit, os_commit) {
        return cc.eq_ignore_ascii_case(oc);
    }

    // Fallback: compare base version numbers (v4.NNNNN)
    let client_base = extract_base_version(client_ver);
    let os_base = extract_base_version(os_ver);

    if let (Some(ref cb), Some(ref ob)) = (client_base, os_base) {
        return cb == ob;
    }

    // Can't compare — assume mismatch
    false
}

/// Detect hardware variant from `hw version` output.
///
/// - `AT91SAM7S256` in uC line → `"generic-256"`
/// - `iCopy` or `PM3ICOPYX` in output → `"icopyx"` (PM3 Max)
/// - `External flash: present` AND `Smartcard reader: present` AND `FPC USART` for BT → `"rdv4-bt"`
/// - `External flash: present` AND `Smartcard reader: present` → `"rdv4"`
/// - Otherwise → `"generic"`
pub fn detect_hardware_variant(output: &str) -> String {
    if UC_256K_RE.is_match(output) {
        return "generic-256".to_string();
    }

    // Detect iCopy-X / PM3 Max platform
    let lower = output.to_lowercase();
    if lower.contains("icopy") || lower.contains("pm3icopyx") {
        return "icopyx".to_string();
    }

    let has_ext_flash = output
        .lines()
        .any(|l| l.to_lowercase().contains("external flash") && l.to_lowercase().contains("present"));
    let has_smartcard = output
        .lines()
        .any(|l| l.to_lowercase().contains("smartcard") && l.to_lowercase().contains("present"));

    if has_ext_flash && has_smartcard {
        // RDV4 with BlueShark BT addon has FPC USART support
        let has_bt = output
            .lines()
            .any(|l| l.to_lowercase().contains("fpc usart") && l.to_lowercase().contains("present"));
        if has_bt {
            "rdv4-bt".to_string()
        } else {
            "rdv4".to_string()
        }
    } else {
        "generic".to_string()
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parse compiled-in protocol modules from `hw version` output.
///
/// The Iceman firmware v4 outputs a section like:
/// ```text
/// [ Compiled with support for ]
///    LF: EM 4x05/4x69, HID Prox, Indala, ...
///    HF: ISO 14443A, MIFARE Classic, iCLASS, ...
/// ```
/// Returns (lf_modules, hf_modules). Empty vecs if the section is not found
/// (e.g. older firmware or firmware that doesn't report this).
fn parse_compiled_modules(output: &str) -> (Vec<String>, Vec<String>) {
    let mut lf_modules = Vec::new();
    let mut hf_modules = Vec::new();

    // Find the "Compiled with" section
    let lower = output.to_lowercase();
    let compiled_start = lower.find("compiled with");
    if compiled_start.is_none() {
        return (lf_modules, hf_modules);
    }
    let section = &output[compiled_start.unwrap()..];

    // Collect all text after "LF:" until "HF:" or end of section
    // Collect all text after "HF:" until next section header "[" or end
    let section_lower = section.to_lowercase();

    if let Some(lf_pos) = section_lower.find("\n") {
        let after_header = &section[lf_pos..];
        let after_lower = after_header.to_lowercase();

        // Find LF: line(s) — may span multiple lines until HF: is found
        if let Some(lf_start) = after_lower.find("lf:") {
            let lf_text_start = lf_start + 3;
            // LF section ends at HF: or a new section header [
            let lf_end = after_lower[lf_text_start..]
                .find("hf:")
                .or_else(|| after_lower[lf_text_start..].find('['))
                .map(|p| lf_text_start + p)
                .unwrap_or(after_lower.len());
            let lf_text = &after_header[lf_text_start..lf_end];
            lf_modules = parse_module_list(lf_text);
        }

        // Find HF: line(s)
        if let Some(hf_start) = after_lower.find("hf:") {
            let hf_text_start = hf_start + 3;
            // HF section ends at a new section header [ or end
            let hf_end = after_lower[hf_text_start..]
                .find('[')
                .map(|p| hf_text_start + p)
                .unwrap_or(after_lower.len());
            let hf_text = &after_header[hf_text_start..hf_end];
            hf_modules = parse_module_list(hf_text);
        }
    }

    (lf_modules, hf_modules)
}

/// Parse a comma-separated module list, handling multi-line continuation.
fn parse_module_list(text: &str) -> Vec<String> {
    // Join lines, split by comma, trim whitespace
    let joined = text.lines().collect::<Vec<_>>().join(" ");
    joined
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn extract_commit_hash(version: &str) -> Option<String> {
    // Try standard `-gHASH` format first
    COMMIT_HASH_RE
        .captures(version)
        .map(|c| c[1].to_lowercase())
        // Fallback: bare hash after last `/` (e.g. `Iceman/master/d5dc045-suspect`)
        .or_else(|| {
            BARE_COMMIT_RE
                .captures(version)
                .map(|c| c[1].to_lowercase())
        })
}

fn extract_base_version(version: &str) -> Option<String> {
    BASE_VERSION_RE.captures(version).map(|c| c[1].to_string())
}

fn parse_model(output: &str) -> String {
    for line in output.lines() {
        let trimmed = line.trim();
        if (trimmed.contains("Prox") && trimmed.contains("RFID"))
            || trimmed.contains("Proxmark")
        {
            let cleaned = trimmed.trim_matches(|c: char| !c.is_alphanumeric() && c != ' ');
            if !cleaned.is_empty() {
                return cleaned.to_string();
            }
        }
    }
    "Proxmark3".to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HW_VERSION: &str = r#"
 [ Proxmark3 RFID instrument ]

 [ Client ]
  client: Iceman/master/v4.20728-234-g1a2b3c4d5

 [ ARM ]
  os: Iceman/master/v4.20728-234-g1a2b3c4d5

 [ FPGA ]
  LF image built for 2s30vq100 on 2024-01-15 at 10:30:00

 [ Hardware ]
  --= uC: AT91SAM7S512 Rev B
  --= Nonvolatile Program Memory Size: 512K bytes
  --= External flash: present
  --= Smartcard reader: present
"#;

    const SAMPLE_MISMATCH: &str = r#"
 [ Proxmark3 RFID instrument ]

 [ Client ]
  client: Iceman/master/v4.20728-234-g1a2b3c4d5

 [ ARM ]
  os: Iceman/master/v4.20725-100-g9876543ab

 [ Hardware ]
  --= uC: AT91SAM7S512 Rev B
"#;

    const SAMPLE_GENERIC_256: &str = r#"
 [ Proxmark3 RFID instrument ]

 [ Client ]
  client: Iceman/master/v4.20728

 [ ARM ]
  os: Iceman/master/v4.20728

 [ Hardware ]
  --= uC: AT91SAM7S256 Rev C
"#;

    #[test]
    fn test_parse_rdv4_matching() {
        let info = parse_detailed_hw_version(SAMPLE_HW_VERSION);
        assert_eq!(info.hardware_variant, "rdv4");
        assert!(info.versions_match);
        assert!(info.client_version.contains("v4.20728"));
        assert!(info.os_version.contains("v4.20728"));
    }

    #[test]
    fn test_parse_mismatch() {
        let info = parse_detailed_hw_version(SAMPLE_MISMATCH);
        assert!(!info.versions_match);
        assert_eq!(info.hardware_variant, "generic");
    }

    #[test]
    fn test_parse_generic_256() {
        let info = parse_detailed_hw_version(SAMPLE_GENERIC_256);
        assert_eq!(info.hardware_variant, "generic-256");
        assert!(info.versions_match); // same base version, no commit hash
    }

    #[test]
    fn test_compare_same_commit() {
        assert!(compare_versions(
            "Iceman/master/v4.20728-234-g1a2b3c4d5",
            "Iceman/master/v4.20728-234-g1a2b3c4d5"
        ));
    }

    #[test]
    fn test_compare_different_commit() {
        assert!(!compare_versions(
            "Iceman/master/v4.20728-234-g1a2b3c4d5",
            "Iceman/master/v4.20725-100-g9876543ab"
        ));
    }

    #[test]
    fn test_compare_dirty_suffix() {
        // Same commit but one has -dirty — commit hash portion still matches
        assert!(compare_versions(
            "Iceman/master/v4.20728-234-g1a2b3c4d5-dirty",
            "Iceman/master/v4.20728-234-g1a2b3c4d5"
        ));
    }

    #[test]
    fn test_compare_base_version_only() {
        // No commit hash — fallback to base version comparison
        assert!(compare_versions(
            "Iceman/master/v4.20728",
            "Iceman/master/v4.20728"
        ));
        assert!(!compare_versions(
            "Iceman/master/v4.20728",
            "Iceman/master/v4.20725"
        ));
    }

    #[test]
    fn test_compare_empty() {
        assert!(!compare_versions("", ""));
        assert!(!compare_versions("Iceman/master/v4.20728", ""));
    }

    #[test]
    fn test_detect_rdv4() {
        let output = "uC: AT91SAM7S512\nExternal flash: present\nSmartcard reader: present";
        assert_eq!(detect_hardware_variant(output), "rdv4");
    }

    #[test]
    fn test_detect_rdv4_bt() {
        let output = "uC: AT91SAM7S512\nExternal flash: present\nSmartcard reader: present\nFPC USART for BT add-on support: present";
        assert_eq!(detect_hardware_variant(output), "rdv4-bt");
    }

    #[test]
    fn test_detect_generic() {
        let output = "uC: AT91SAM7S512\nExternal flash: not present";
        assert_eq!(detect_hardware_variant(output), "generic");
    }

    #[test]
    fn test_detect_generic_256() {
        let output = "uC: AT91SAM7S256 Rev C";
        assert_eq!(detect_hardware_variant(output), "generic-256");
    }

    /// Real PM3 v4.20728 output — no `client:` prefix, `OS.........` with dots
    const SAMPLE_REAL_PM3: &str = r#"
[ Proxmark3 ]
[ Client ]
Iceman/master/v4.20728-358-ga2ba91043-suspect 2026-02-09 00:22:45 c0679a575
Compiler.................. MinGW-w64 15.2.0
Platform.................. Windows (64b) / x86_64
[ ARM ]
Bootrom.... Iceman/master/v4.20469-164-g0e95c62ad-suspect 2025-08-02 22:16:55 ef5b2e843
OS......... Iceman/master/v4.20728-358-ga2ba91043-suspect 2026-02-09 00:22:17 c0679a575
[ Hardware ]
--= uC: AT91SAM7S512 Rev B
--= Embedded flash memory 512K bytes ( 71% used )
"#;

    #[test]
    fn test_parse_real_pm3_output() {
        let info = parse_detailed_hw_version(SAMPLE_REAL_PM3);
        assert!(info.client_version.contains("v4.20728"), "client: {}", info.client_version);
        assert!(info.os_version.contains("v4.20728"), "os: {}", info.os_version);
        assert!(info.versions_match, "should match — same commit hash");
        assert_eq!(info.hardware_variant, "generic");
    }

    /// Real PM3 output with mismatched versions
    const SAMPLE_REAL_MISMATCH: &str = r#"
[ Proxmark3 ]
[ Client ]
Iceman/master/v4.20728-358-ga2ba91043-suspect 2026-02-09 00:22:45 c0679a575
[ ARM ]
Bootrom.... Iceman/master/v4.20469-164-g0e95c62ad-suspect 2025-08-02 22:16:55 ef5b2e843
OS......... Iceman/master/v4.20469-164-g0e95c62ad-suspect 2025-08-02 22:16:55 ef5b2e843
[ Hardware ]
--= uC: AT91SAM7S512 Rev B
"#;

    #[test]
    fn test_parse_real_pm3_mismatch() {
        let info = parse_detailed_hw_version(SAMPLE_REAL_MISMATCH);
        assert!(info.client_version.contains("v4.20728"), "client: {}", info.client_version);
        assert!(info.os_version.contains("v4.20469"), "os: {}", info.os_version);
        assert!(!info.versions_match, "should NOT match — different commits");
    }

    // -----------------------------------------------------------------------
    // Compiled module parsing tests
    // -----------------------------------------------------------------------

    const SAMPLE_WITH_MODULES: &str = r#"
[ Proxmark3 RFID instrument ]
[ Client ]
  client: Iceman/master/v4.20728-234-g1a2b3c4d5
[ ARM ]
  os: Iceman/master/v4.20728-234-g1a2b3c4d5
[ Hardware ]
  --= uC: AT91SAM7S512 Rev B
[ Compiled with support for ]
   LF: EM 4x05/4x69, HID Prox, Indala, AWID, IO Prox, FDX-B,
       Paradox, Viking, T55xx
   HF: ISO 14443A, ISO 14443B, MIFARE Classic, iCLASS
"#;

    #[test]
    fn test_parse_compiled_modules_full() {
        let info = parse_detailed_hw_version(SAMPLE_WITH_MODULES);
        assert!(!info.compiled_with_lf.is_empty(), "should have LF modules");
        assert!(!info.compiled_with_hf.is_empty(), "should have HF modules");

        // Check specific LF modules
        assert!(info.compiled_with_lf.iter().any(|m| m.contains("EM 4x05")));
        assert!(info.compiled_with_lf.iter().any(|m| m.contains("HID Prox")));
        assert!(info.compiled_with_lf.iter().any(|m| m.contains("T55xx")));

        // Check specific HF modules
        assert!(info.compiled_with_hf.iter().any(|m| m.contains("14443A")));
        assert!(info.compiled_with_hf.iter().any(|m| m.contains("MIFARE Classic")));
        assert!(info.compiled_with_hf.iter().any(|m| m.contains("iCLASS")));
    }

    const SAMPLE_256K_STRIPPED: &str = r#"
[ Proxmark3 RFID instrument ]
[ Client ]
  client: Iceman/master/v4.20728
[ ARM ]
  os: Iceman/master/v4.20728
[ Hardware ]
  --= uC: AT91SAM7S256 Rev C
[ Compiled with support for ]
   LF: EM 4x05/4x69, HID Prox, T55xx
   HF: ISO 14443A, MIFARE Classic
"#;

    #[test]
    fn test_parse_compiled_modules_stripped_256k() {
        let info = parse_detailed_hw_version(SAMPLE_256K_STRIPPED);
        assert_eq!(info.hardware_variant, "generic-256");

        // iCLASS should NOT be present (stripped for 256K)
        assert!(!info.compiled_with_hf.iter().any(|m| m.to_lowercase().contains("iclass")),
            "iCLASS should not be compiled in 256K firmware");

        // DESFire should NOT be present
        assert!(!info.compiled_with_hf.iter().any(|m| m.to_lowercase().contains("desfire")),
            "DESFire should not be compiled in 256K firmware");

        // But MIFARE Classic should be present
        assert!(info.compiled_with_hf.iter().any(|m| m.contains("MIFARE Classic")));
    }

    #[test]
    fn test_parse_no_compiled_section() {
        // Older firmware without "Compiled with" section
        let info = parse_detailed_hw_version(SAMPLE_HW_VERSION);
        assert!(info.compiled_with_lf.is_empty(), "no modules expected for old format");
        assert!(info.compiled_with_hf.is_empty(), "no modules expected for old format");
    }

    /// Bare commit hash format without `-g` prefix or `vX.XXXXX` version.
    /// Real output: `Iceman/master/d5dc045-suspect`
    const SAMPLE_BARE_COMMIT: &str = r#"
[ Proxmark3 ]
[ Client ]
Iceman/master/d5dc045-suspect 2026-03-10 16:41:36 015316e05
[ ARM ]
OS......... Iceman/master/d5dc045-suspect 2026-03-10 17:58:19 015316e05
[ Hardware ]
--= uC: AT91SAM7S512 Rev B
--= Embedded flash memory 512K bytes ( 43% used )
"#;

    #[test]
    fn test_parse_bare_commit_matching() {
        let info = parse_detailed_hw_version(SAMPLE_BARE_COMMIT);
        assert!(info.versions_match, "same bare commit hash should match: client={}, os={}", info.client_version, info.os_version);
        assert_eq!(info.hardware_variant, "generic");
    }

    #[test]
    fn test_compare_bare_commit_hash() {
        // Same bare commit (no `-g` prefix)
        assert!(compare_versions(
            "Iceman/master/d5dc045-suspect 2026-03-10 16:41:36 015316e05",
            "Iceman/master/d5dc045-suspect 2026-03-10 17:58:19 015316e05"
        ));
        // Different bare commits
        assert!(!compare_versions(
            "Iceman/master/d5dc045-suspect",
            "Iceman/master/a1b2c3d-suspect"
        ));
    }
}
