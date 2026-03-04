import { useRef, useEffect, useState } from 'react';
import { useTerminalLog, type LogLine } from '../../hooks/useTerminalLog';
import { useSettings } from '../../hooks/useSettings';
import { useWizard } from '../../hooks/useWizard';
import { runRawCommand } from '../../lib/api';

export function DetailsDrawer() {
  const { lines, clear } = useTerminalLog();
  const { settings } = useSettings();
  const wizard = useWizard();
  const [collapsed, setCollapsed] = useState(true);
  const [cmdInput, setCmdInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const port = wizard.context.port;
  const expertMode = settings.expertMode;
  const canSend = !!port && !sending && cmdInput.trim().length > 0;

  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, collapsed]);

  const handleSubmit = async () => {
    const cmd = cmdInput.trim();
    if (!cmd || !port || sending) return;
    setCmdInput('');
    setSending(true);
    try {
      await runRawCommand(port, cmd);
    } catch {
      // errors emitted by backend
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-secondary)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-4)',
          cursor: 'pointer',
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Console Output
        </span>
        {lines.length > 0 && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-quaternary)',
              background: 'var(--bg-tertiary)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {lines.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            clear();
          }}
          style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Clear
        </button>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            transition: 'transform var(--transition-fast)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}
        >
          &#x25B2;
        </span>
      </div>

      {/* Log body */}
      {!collapsed && (
        <>
          <div
            ref={scrollRef}
            style={{
              height: '180px',
              overflowY: 'auto',
              padding: 'var(--space-2) var(--space-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              lineHeight: '1.6',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-secondary)',
              borderBottom: expertMode ? '1px solid var(--border-secondary)' : undefined,
            }}
          >
            {lines.length === 0 ? (
              <div style={{ color: 'var(--text-quaternary)', fontStyle: 'italic' }}>
                Waiting for device output...
              </div>
            ) : (
              lines.map((line, i) => <LogEntry key={i} line={line} />)
            )}
          </div>

          {/* Expert mode command input */}
          {expertMode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                background: 'var(--bg-primary)',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)' }}>{'>'}</span>
              <input
                ref={inputRef}
                type="text"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={!port}
                placeholder={port ? 'Enter PM3 command...' : 'Connect device first'}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              <button
                onClick={canSend ? handleSubmit : undefined}
                disabled={!canSend}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: canSend ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: canSend ? '#fff' : 'var(--text-quaternary)',
                  cursor: canSend ? 'pointer' : 'default',
                  opacity: sending ? 0.6 : 1,
                }}
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LogEntry({ line }: { line: LogLine }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      <span style={{ color: line.isError ? 'var(--error)' : 'var(--text-secondary)' }}>
        {line.text}
      </span>
    </div>
  );
}
