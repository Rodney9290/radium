use serde::{Deserialize, Serialize};

/// Hardware platform variants for Proxmark3 devices.
/// Determines firmware compatibility and feature set.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProxmarkPlatform {
    /// PM3 Easy and generic clones (PM3GENERIC)
    Easy,
    /// Proxmark3 RDV4 (PM3RDV4)
    RDV4,
    /// Proxmark3 RDV4 with BlueShark BT addon
    RDV4BT,
    /// iCopy-X / PM3 Max (PM3ICOPYX)
    ICopyX,
    /// Generic with AT91SAM7S256 (256K flash)
    Generic256,
}

impl ProxmarkPlatform {
    /// Human-readable display name.
    #[allow(dead_code)]
    pub fn display_name(&self) -> &str {
        match self {
            ProxmarkPlatform::Easy => "Proxmark3 Easy",
            ProxmarkPlatform::RDV4 => "Proxmark3 RDV4",
            ProxmarkPlatform::RDV4BT => "Proxmark3 RDV4 + BT",
            ProxmarkPlatform::ICopyX => "iCopy-X / PM3 Max",
            ProxmarkPlatform::Generic256 => "Proxmark3 (256K)",
        }
    }

    /// Firmware build flag name used by the PM3 build system.
    #[allow(dead_code)]
    pub fn firmware_platform(&self) -> &str {
        match self {
            ProxmarkPlatform::Easy | ProxmarkPlatform::Generic256 => "PM3GENERIC",
            ProxmarkPlatform::RDV4 | ProxmarkPlatform::RDV4BT => "PM3RDV4",
            ProxmarkPlatform::ICopyX => "PM3ICOPYX",
        }
    }

    /// Hardware variant string for firmware flash file selection.
    /// Maps to directory names under `firmware/`.
    #[allow(dead_code)]
    pub fn flash_variant(&self) -> &str {
        match self {
            ProxmarkPlatform::Easy | ProxmarkPlatform::Generic256 => "generic",
            ProxmarkPlatform::RDV4 => "rdv4",
            ProxmarkPlatform::RDV4BT => "rdv4-bt",
            ProxmarkPlatform::ICopyX => "icopyx",
        }
    }
}

/// Capabilities detected on device connection via `hw version`.
/// Stored for the lifetime of the session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCapabilities {
    /// Serial port path (e.g., "COM3", "/dev/ttyACM0")
    pub port: String,
    /// Device model string (e.g., "Proxmark3 RFID instrument")
    pub model: String,
    /// Detected hardware platform
    pub platform: ProxmarkPlatform,
    /// Client software version string
    pub client_version: String,
    /// Device firmware (OS) version string
    pub firmware_version: String,
    /// Whether client and firmware versions match
    pub versions_match: bool,
    /// Raw hardware variant string from version.rs
    pub hardware_variant: String,
    /// Whether external flash is present (RDV4 feature)
    pub has_external_flash: bool,
    /// Whether smartcard reader is present (RDV4 feature)
    pub has_smartcard: bool,
    /// Whether BT addon is present
    pub has_bt: bool,
}

impl DeviceCapabilities {
    /// Create capabilities from parsed `hw version` output.
    pub fn from_hw_version(
        port: String,
        model: String,
        client_version: String,
        firmware_version: String,
        versions_match: bool,
        hardware_variant: String,
        hw_version_output: &str,
    ) -> Self {
        let platform = Self::detect_platform(&hardware_variant);
        let has_external_flash = hw_version_output
            .lines()
            .any(|l| {
                let lower = l.to_lowercase();
                lower.contains("external flash") && lower.contains("present")
            });
        let has_smartcard = hw_version_output
            .lines()
            .any(|l| {
                let lower = l.to_lowercase();
                lower.contains("smartcard") && lower.contains("present")
            });
        let has_bt = hw_version_output
            .lines()
            .any(|l| {
                let lower = l.to_lowercase();
                lower.contains("fpc usart") && lower.contains("present")
            });

        Self {
            port,
            model,
            platform,
            client_version,
            firmware_version,
            versions_match,
            hardware_variant,
            has_external_flash,
            has_smartcard,
            has_bt,
        }
    }

    fn detect_platform(variant: &str) -> ProxmarkPlatform {
        match variant {
            "rdv4-bt" => ProxmarkPlatform::RDV4BT,
            "rdv4" => ProxmarkPlatform::RDV4,
            "icopyx" => ProxmarkPlatform::ICopyX,
            "generic-256" => ProxmarkPlatform::Generic256,
            _ => ProxmarkPlatform::Easy,
        }
    }
}

impl Default for DeviceCapabilities {
    fn default() -> Self {
        Self {
            port: String::new(),
            model: String::new(),
            platform: ProxmarkPlatform::Easy,
            client_version: String::new(),
            firmware_version: String::new(),
            versions_match: false,
            hardware_variant: String::new(),
            has_external_flash: false,
            has_smartcard: false,
            has_bt: false,
        }
    }
}
