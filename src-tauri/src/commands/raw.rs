use tauri::State;

use crate::error::AppError;
use crate::pm3::session::Pm3Session;

#[tauri::command]
pub async fn run_raw_command(
    session: State<'_, Pm3Session>,
    _port: String,
    command: String,
) -> Result<String, AppError> {
    session.run_command(&command).await
}
