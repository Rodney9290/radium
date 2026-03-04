# Radium

Desktop GUI for Proxmark3. Scan, clone and manage RFID/NFC cards without touching the command line.

![Windows](https://img.shields.io/badge/Windows-10%2B-blue) ![macOS](https://img.shields.io/badge/macOS-12%2B-lightgrey) ![Linux](https://img.shields.io/badge/Linux-x64-orange) ![License](https://img.shields.io/badge/license-GPL--3.0-green) ![Version](https://img.shields.io/badge/version-1.2.0-brightgreen)

## What it does

Radium wraps the Proxmark3 client into a visual wizard. You plug in your Proxmark, place a card on the reader, and Radium handles the rest: identifying the card type, reading its data, detecting the right blank, and writing the clone. The whole process is point-and-click.

**LF (125 kHz)** cards are cloned in seconds. **HF (13.56 MHz)** cards like MIFARE Classic go through automatic key recovery (autopwn) with real-time progress, then write to a magic card.

## Supported cards

### LF (125 kHz) - 22 types

HID ProxII, EM4100, AWID, IOProx, Indala, FDX-B, HID Corporate 1000, Paradox, Keri, Viking, Visa2000, Noralsy, Presco, Jablotron, NexWatch, PAC/Stanley, SecuraKey, Gallagher, GProxII, Pyramid, NEDAP, T55x7

### HF (13.56 MHz) - 6 types

MIFARE Classic 1K/4K (with autopwn key recovery), MIFARE Ultralight, NTAG, iCLASS/PicoPass, DESFire (detection only, non-cloneable)

### Supported magic blanks

T5577 (LF), EM4305 (LF), Gen1a, Gen2/CUID, Gen3, Gen4 GTU, Gen4 GDM/USCUID, Magic Ultralight, iCLASS blank (HF)

### Supported devices

- Proxmark3 Easy (generic)
- Proxmark3 RDV4
- Proxmark3 RDV4 + Bluetooth
- Proxmark3 Max / iCopy-X
- Generic 256KB variants

## Requirements

- **Proxmark3** device (Easy, RDV4, Max, or compatible clone)
- **Windows 10+** (x64), **macOS 12+** (x64/Apple Silicon), or **Linux** (x64, AppImage or .deb)
- USB cable (data cable, not charge-only)

Proxmark3 firmware v4.20728+ recommended.

### Linux additional requirements

On Linux, your user must be in the `dialout` and `plugdev` groups, and udev rules must be installed for the Proxmark3 device. Radium checks permissions automatically and provides the fix commands if needed. See `resources/77-proxmark3.rules`.

On Linux, Radium uses the system-installed PM3 client (found via PATH). Install the Proxmark3 client from your distribution's package manager or build from source.

## Installation

### Build from source

```bash
# Prerequisites: Node.js 18+, Rust 1.70+

git clone https://github.com/Rodney9290/radium.git
cd radium
npm install
npx tauri dev      # development
npx tauri build    # production build (Windows: NSIS, macOS: .dmg, Linux: deb + AppImage)
```

The Proxmark3 client sidecar binary must be placed in `src-tauri/binaries/` named `proxmark3-{target_triple}` (e.g. `proxmark3-x86_64-apple-darwin` for macOS). Build it from the [Iceman fork](https://github.com/RfidResearchGroup/proxmark3) with `make client`.

### Linux additional setup

1. Install the Proxmark3 client (`apt install proxmark3` or build from source)
2. Set up device permissions:
   ```bash
   sudo usermod -aG dialout $USER
   sudo usermod -aG plugdev $USER
   sudo cp /path/to/77-proxmark3.rules /etc/udev/rules.d/
   sudo udevadm control --reload-rules && sudo udevadm trigger
   # Log out and back in for group changes to take effect
   ```

## How to use

1. **Connect** — Click "Connect" to detect your Proxmark3 device
2. **Scan** — Place a card on the reader. Radium identifies the card type and frequency automatically
3. **Blank** — Place a blank magic card on the reader. Radium detects the blank type and checks compatibility
4. **Write** — Radium writes the cloned data to the blank card
5. **Verify** — Radium reads back the written card to confirm the clone matches the original

For HF cards (MIFARE Classic), Radium runs automatic key recovery (autopwn) before cloning. This can take a few minutes depending on the card's security.

## Features

- **One-click cloning** for LF and HF cards
- **Auto-detection** of card type and frequency
- **MIFARE Classic autopwn** with live progress (dictionary, nested, darkside, hardnested attacks)
- **Magic card detection** identifies Gen1a through Gen4 GDM
- **Blank card data check** warns if the blank already has data written to it
- **Firmware flash** with variant picker (RDV4, RDV4+BT, Generic, iCopy-X)
- **Device capability detection** — identifies device model, firmware, hardware variant
- **Saved cards** — save scanned cards to local database for later cloning
- **Clone history** — track all past clone operations
- **Chip erase** — standalone T5577/EM4305 wipe tool
- **Expert mode** — raw PM3 command input in the console drawer
- **Linux permissions checker** — detects missing group membership / udev rules and shows fix commands
- **Sound effects and music** — optional audio feedback and ambient music (off by default)
- **Dark mode** — follows system preference

## Architecture

```
Frontend (React 19 + XState v5 + TypeScript)
├── Apple-esque design system (system fonts, light/dark mode)
├── SegmentedControl tab navigation (Clone, Erase, Saved, History, Settings)
├── 12 wizard step components
├── Shared component library (Button, Card, ProgressBar, Badge, etc.)
└── Tauri IPC → Rust backend

Backend (Rust / Tauri v2)
├── Pm3Session — command serialization, transport abstraction
├── Pm3Transport trait — pluggable backends (interactive CLI, batch CLI fallback)
├── DeviceCapabilities — model detection, firmware version, hardware variant
├── Output parser — regex-based parsing of PM3 CLI output
├── Command builder — type-safe PM3 command construction
├── Linux permissions — group/udev checking
└── SQLite — saved cards, clone history
```

## Tech stack

Tauri v2, React 19, TypeScript, XState v5, Rust. Dual state machine architecture: Rust backend (WizardMachine) and frontend (XState) stay in sync through Tauri commands.

## Credits

Radium is a fork of [Phosphor](https://github.com/nikitaart2000/phosphor) by nikitaart2000, modified in 2025–2026 with:

- Persistent PM3 session manager with transport abstraction (interactive + batch fallback)
- Linux support (permission checker, udev rules, AppImage/deb packaging)
- Device capability detection (model, firmware, hardware variant)
- Renamed from Phosphor to Radium

## License

[GPL-3.0](LICENSE)
