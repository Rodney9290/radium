import { useEffect, useState, useCallback, useRef } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { getSavedCards, deleteSavedCard, saveCard, updateCardNotes, type SavedCard } from '../../lib/api';
import { useWizard } from '../../hooks/useWizard';

function formatLocalTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.replace('T', ' ').slice(0, 19);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatFrequency(freq: string): string {
  const lower = freq.toLowerCase();
  if (lower.includes('lf') || lower.includes('125') || lower.includes('low')) return '125 kHz';
  if (lower.includes('hf') || lower.includes('13.56') || lower.includes('high')) return '13.56 MHz';
  return freq;
}

function parseDecoded(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = String(v);
      }
      return result;
    }
  } catch { /* malformed JSON */ }
  return {};
}

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) 0',
  borderBottom: '1px solid var(--border-secondary)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-sans)',
};

const valueStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3) var(--space-4)',
  paddingLeft: 'var(--space-10)',
  fontSize: '14px',
  fontFamily: 'var(--font-sans)',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 'var(--radius-full)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color var(--transition-fast)',
};

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
      position: 'absolute', left: 'var(--space-4)', top: '50%',
      transform: 'translateY(-50%)', color: 'var(--text-quaternary)',
    }}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface SavedViewProps {
  refreshTrigger?: number;
  onNavigateToClone?: () => void;
}

export function SavedView({ refreshTrigger, onNavigateToClone }: SavedViewProps) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<number, boolean>>({});
  const [notesError, setNotesError] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wizard = useWizard();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // External refresh trigger (keyboard shortcut)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) refresh();
  }, [refreshTrigger, refresh]);

  const filteredCards = searchQuery.trim()
    ? cards.filter(card => {
        const q = searchQuery.toLowerCase();
        return (
          card.name.toLowerCase().includes(q) ||
          card.cardType.toLowerCase().includes(q) ||
          card.uid.toLowerCase().includes(q)
        );
      })
    : cards;

  const handleExport = () => {
    const json = JSON.stringify(cards, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radium-cards-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error('Invalid format: expected array');
      for (const card of imported) {
        await saveCard({
          name: card.name ?? 'Imported Card',
          cardType: card.cardType ?? '',
          frequency: card.frequency ?? '',
          uid: card.uid ?? '',
          raw: card.raw ?? '',
          decoded: typeof card.decoded === 'string' ? card.decoded : JSON.stringify(card.decoded ?? {}),
          cloneable: card.cloneable ?? false,
          recommendedBlank: card.recommendedBlank ?? 'T5577',
          createdAt: card.createdAt ?? new Date().toISOString(),
          notes: card.notes ?? null,
        });
      }
      refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import cards');
    }
    e.target.value = '';
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const start = Date.now();
    getSavedCards()
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          const map: Record<number, string> = {};
          for (const c of data) {
            if (c.id !== null) map[c.id] = c.notes ?? '';
          }
          setNotesMap(map);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load saved cards';
          setError(msg);
        }
      })
      .finally(() => {
        if (cancelled) return;
        const elapsed = Date.now() - start;
        const delay = Math.max(0, 300 - elapsed);
        setTimeout(() => { if (!cancelled) setLoading(false); }, delay);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleDelete = async (id: number) => {
    try {
      await deleteSavedCard(id);
      setExpandedId(null);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null ? (Object.values(err)[0] as string) ?? String(err)
        : String(err);
      setError(msg);
    }
  };

  const handleSaveNotes = async (id: number) => {
    setNotesSaving(prev => ({ ...prev, [id]: true }));
    setNotesError(prev => ({ ...prev, [id]: '' }));
    try {
      const text = notesMap[id] ?? '';
      await updateCardNotes(id, text.trim() === '' ? null : text.trim());
      setCards(prev => prev.map(c => c.id === id ? { ...c, notes: text.trim() === '' ? null : text.trim() } : c));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null ? (Object.values(err)[0] as string) ?? 'Failed to save notes'
        : 'Failed to save notes';
      setNotesError(prev => ({ ...prev, [id]: msg }));
    } finally {
      setNotesSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleClone = async (card: SavedCard) => {
    const decoded = parseDecoded(card.decoded);
    await wizard.loadSavedCard({
      frequency: card.frequency,
      cardType: card.cardType,
      uid: card.uid,
      raw: card.raw,
      decoded,
      cloneable: card.cloneable,
      recommendedBlank: card.recommendedBlank,
    });
    onNavigateToClone?.();
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Saved Cards
          </h2>
        </div>
        <Card>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) 0',
            justifyContent: 'center',
          }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }}
            >
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
            }}>
              Loading saved cards...
            </span>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Saved Cards
          </h2>
        </div>
        <InlineNotice variant="error">
          {error}
        </InlineNotice>
        <div>
          <Button variant="secondary" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (cards.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Saved Cards
          </h2>
        </div>
        <Card>
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-6) 0',
          }}>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              margin: '0 0 var(--space-4) 0',
            }}>
              No saved cards yet.
            </p>
            <Button variant="secondary" size="sm" onClick={refresh}>
              Refresh
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const expanded = expandedId !== null ? cards.find(c => c.id === expandedId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Saved Cards
          </h2>
          <p style={{
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            margin: 'var(--space-1) 0 0 0',
          }}>
            {searchQuery.trim()
              ? `${filteredCards.length} of ${cards.length} cards`
              : `${cards.length} card${cards.length !== 1 ? 's' : ''} saved`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" size="sm" onClick={handleExport}>Export</Button>
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>Import</Button>
          <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search by name, type, or UID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
        />
        <SearchIcon />
      </div>

      {importError && <InlineNotice variant="error">Import failed: {importError}</InlineNotice>}

      {/* Empty search */}
      {filteredCards.length === 0 && searchQuery.trim() && (
        <Card>
          <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              No cards match your search
            </p>
          </div>
        </Card>
      )}

      {/* Card list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {filteredCards.map((card, idx) => {
          const isExpanded = card.id === expandedId;

          return (
            <Card
              key={card.id ?? idx}
              style={{
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                borderColor: isExpanded ? 'var(--accent)' : undefined,
              }}
            >
              {/* Summary row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : (card.id ?? null))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {card.name}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-sans)',
                    marginTop: '2px',
                  }}>
                    {formatLocalTime(card.createdAt)}
                  </div>
                </div>
                <Badge variant="neutral" label={card.cardType} dot={false} />
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{
                    color: 'var(--text-quaternary)',
                    transition: 'transform var(--transition-fast)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    flexShrink: 0,
                  }}
                >
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Expanded detail */}
              {isExpanded && expanded && (
                <div style={{
                  marginTop: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--border-secondary)',
                }}>
                  <div style={infoRowStyle}>
                    <span style={labelStyle}>UID</span>
                    <span style={valueStyle}>{expanded.uid}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={labelStyle}>Frequency</span>
                    <span style={valueStyle}>{formatFrequency(expanded.frequency)}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={labelStyle}>Recommended Blank</span>
                    <span style={valueStyle}>{expanded.recommendedBlank}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={labelStyle}>Cloneable</span>
                    <Badge
                      variant={expanded.cloneable ? 'success' : 'error'}
                      label={expanded.cloneable ? 'Yes' : 'No'}
                    />
                  </div>
                  {expanded.raw && (
                    <div style={infoRowStyle}>
                      <span style={labelStyle}>Raw</span>
                      <span style={{
                        ...valueStyle,
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {expanded.raw}
                      </span>
                    </div>
                  )}
                  {/* Decoded fields */}
                  {(() => {
                    const decoded = parseDecoded(expanded.decoded);
                    const keys = Object.keys(decoded);
                    if (keys.length === 0) return null;
                    return keys.map(k => (
                      <div key={k} style={infoRowStyle}>
                        <span style={labelStyle}>{k}</span>
                        <span style={valueStyle}>{decoded[k]}</span>
                      </div>
                    ));
                  })()}

                  {/* Notes */}
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-sans)',
                      marginBottom: 'var(--space-2)',
                    }}>
                      Notes
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Add notes about this card..."
                      value={expanded.id !== null ? (notesMap[expanded.id] ?? '') : ''}
                      onChange={(e) => {
                        if (expanded.id !== null) {
                          setNotesMap(prev => ({ ...prev, [expanded.id!]: e.target.value }));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: 'var(--space-2) var(--space-3)',
                        fontSize: '13px',
                        fontFamily: 'var(--font-sans)',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
                    />
                  </div>

                  {/* Notes save error */}
                  {expanded.id !== null && notesError[expanded.id] && (
                    <p style={{
                      fontSize: '12px',
                      color: 'var(--color-error, #ef4444)',
                      fontFamily: 'var(--font-sans)',
                      margin: 'var(--space-2) 0 0 0',
                    }}>
                      {notesError[expanded.id]}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div style={{
                    marginTop: 'var(--space-3)',
                    display: 'flex',
                    gap: 'var(--space-2)',
                  }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleClone(expanded)}
                    >
                      Clone This
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={expanded.id === null || notesSaving[expanded.id ?? -1]}
                      onClick={() => { if (expanded.id !== null) handleSaveNotes(expanded.id); }}
                    >
                      {expanded.id !== null && notesSaving[expanded.id] ? 'Saving…' : 'Save Notes'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { if (expanded.id !== null) handleDelete(expanded.id); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
