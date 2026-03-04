use serde::Serialize;

/// Result of checking Linux device permissions.
/// On non-Linux platforms, all checks return true/empty.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheck {
    pub has_permission: bool,
    pub user_in_dialout: bool,
    pub user_in_plugdev: bool,
    pub udev_rule_installed: bool,
    pub device_path: String,
    pub device_permissions: String,
    pub fix_commands: Vec<String>,
}

impl PermissionCheck {
    /// Returns an all-clear result (used on non-Linux platforms).
    pub fn all_ok() -> Self {
        Self {
            has_permission: true,
            user_in_dialout: true,
            user_in_plugdev: true,
            udev_rule_installed: true,
            device_path: String::new(),
            device_permissions: String::new(),
            fix_commands: Vec::new(),
        }
    }
}

/// Check device permissions on the current platform.
/// On non-Linux: returns all-OK immediately.
/// On Linux: checks group membership, udev rules, and device file permissions.
pub fn check_permissions(device_path: Option<&str>) -> PermissionCheck {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = device_path;
        PermissionCheck::all_ok()
    }

    #[cfg(target_os = "linux")]
    {
        check_permissions_linux(device_path)
    }
}

#[cfg(target_os = "linux")]
fn check_permissions_linux(device_path: Option<&str>) -> PermissionCheck {
    use std::fs;
    use std::os::unix::fs::MetadataExt;

    let username = std::env::var("USER").unwrap_or_default();

    // Check group membership by reading /etc/group
    let groups_content = fs::read_to_string("/etc/group").unwrap_or_default();
    let user_in_dialout = is_user_in_group(&groups_content, "dialout", &username);
    let user_in_plugdev = is_user_in_group(&groups_content, "plugdev", &username);

    // Check udev rule
    let udev_rule_installed = fs::metadata("/etc/udev/rules.d/77-proxmark3.rules").is_ok()
        || fs::metadata("/lib/udev/rules.d/77-proxmark3.rules").is_ok();

    // Check device file permissions
    let dev_path = device_path.unwrap_or("/dev/ttyACM0");
    let (dev_perms, has_dev_permission) = match fs::metadata(dev_path) {
        Ok(meta) => {
            let mode = meta.mode();
            let perms = format!("{:o}", mode & 0o7777);
            // Check if world-readable/writable or group matches
            let world_rw = (mode & 0o006) == 0o006;
            (perms, world_rw || (user_in_dialout && (mode & 0o060) == 0o060))
        }
        Err(_) => ("N/A".to_string(), false),
    };

    let has_permission = user_in_dialout && udev_rule_installed && has_dev_permission;

    // Build fix commands
    let mut fix_commands = Vec::new();
    if !user_in_dialout {
        fix_commands.push(format!("sudo usermod -aG dialout {}", username));
    }
    if !user_in_plugdev {
        fix_commands.push(format!("sudo usermod -aG plugdev {}", username));
    }
    if !udev_rule_installed {
        fix_commands.push(
            "sudo cp /path/to/77-proxmark3.rules /etc/udev/rules.d/".to_string(),
        );
        fix_commands.push("sudo udevadm control --reload-rules".to_string());
        fix_commands.push("sudo udevadm trigger".to_string());
    }
    if !fix_commands.is_empty() {
        fix_commands.push("# Log out and back in for group changes to take effect".to_string());
    }

    PermissionCheck {
        has_permission,
        user_in_dialout,
        user_in_plugdev,
        udev_rule_installed,
        device_path: dev_path.to_string(),
        device_permissions: dev_perms,
        fix_commands,
    }
}

#[cfg(target_os = "linux")]
fn is_user_in_group(groups_content: &str, group_name: &str, username: &str) -> bool {
    for line in groups_content.lines() {
        // Format: group_name:x:gid:user1,user2,...
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 4 && parts[0] == group_name {
            return parts[3]
                .split(',')
                .any(|u| u.trim() == username);
        }
    }
    false
}
