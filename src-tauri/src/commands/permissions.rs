use crate::pm3::linux_perms::{self, PermissionCheck};

/// Check device permissions (primarily for Linux).
/// Returns structured permission status with fix commands if needed.
/// On non-Linux platforms, returns all-OK.
#[tauri::command]
pub async fn check_device_permissions(device_path: Option<String>) -> Result<PermissionCheck, ()> {
    Ok(linux_perms::check_permissions(device_path.as_deref()))
}
