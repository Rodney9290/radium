// ---------------------------------------------------------------------------
// Output line — used by transport streaming callbacks
// ---------------------------------------------------------------------------

/// A single line of output from the PM3 process.
#[derive(Debug, Clone)]
pub struct OutputLine {
    pub text: String,
    pub is_error: bool,
}
