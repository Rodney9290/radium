import { useEffect, useState, useCallback } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { getSavedCards, deleteSavedCard, type SavedCard } from '../../lib/api';
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

export function SavedView() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const wizard = useWizard();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const start = Date.now();
    getSavedCards()
      .then((data) => {
        if (!cancelled) setCards(data);
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

  const handleClone = (card: SavedCard) => {
    const decoded = parseDecoded(card.decoded);
    wizard.loadSavedCard({
      frequency: card.frequency,
      cardType: card.cardType,
      uid: card.uid,
      raw: card.raw,
      decoded,
      cloneable: card.cloneable,
      recommendedBlank: card.recommendedBlank,
    });
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
            {cards.length} card{cards.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {/* Card list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {cards.map((card, idx) => {
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
