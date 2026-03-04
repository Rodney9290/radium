import { useEffect, useState, useCallback } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { SegmentedControl } from '../shared/SegmentedControl';
import { getHistory, deleteHistoryRecord, clearHistory } from '../../lib/api';
import type { CloneRecord } from '../../machines/types';

interface HistoryRecord {
  id: number;
  source: string;
  target: string;
  sourceUid: string;
  targetUid: string;
  date: string;
  rawTimestamp: string;
  status: 'ok' | 'fail';
}

function formatLocalTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.replace('T', ' ').slice(0, 19);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Map backend CloneRecord to display HistoryRecord */
function toHistoryRecord(r: CloneRecord): HistoryRecord {
  return {
    id: r.id ?? 0,
    source: r.source_type,
    target: r.target_type,
    sourceUid: r.source_uid || '---',
    targetUid: r.target_uid || '---',
    date: formatLocalTime(r.timestamp),
    rawTimestamp: r.timestamp,
    status: r.success ? 'ok' as const : 'fail' as const,
  };
}

const rowLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-sans)',
};

const rowValueStyle: React.CSSProperties = {
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

type StatusFilter = 'all' | 'success' | 'failed';
type TimeFilter = 'all' | '7d' | '30d';

interface HistoryViewProps {
  refreshTrigger?: number;
}

export function HistoryView({ refreshTrigger }: HistoryViewProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // External refresh trigger (keyboard shortcut)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) refresh();
  }, [refreshTrigger, refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const start = Date.now();
    getHistory()
      .then((data: CloneRecord[]) => {
        if (!cancelled) {
          setRecords(data.map(toHistoryRecord));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load history';
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
      await deleteHistoryRecord(id);
      setConfirmDeleteId(null);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete record';
      setError(msg);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearHistory();
      setConfirmClearAll(false);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear history';
      setError(msg);
    }
  };

  // Combined filter logic
  const filteredRecords = records.filter(rec => {
    // Status filter
    if (statusFilter === 'success' && rec.status !== 'ok') return false;
    if (statusFilter === 'failed' && rec.status !== 'fail') return false;

    // Time filter
    if (timeFilter !== 'all') {
      const recordDate = new Date(rec.rawTimestamp);
      const now = new Date();
      const daysAgo = timeFilter === '7d' ? 7 : 30;
      const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      if (recordDate < cutoff) return false;
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        rec.source.toLowerCase().includes(q) ||
        rec.target.toLowerCase().includes(q) ||
        rec.sourceUid.toLowerCase().includes(q) ||
        rec.targetUid.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const hasActiveFilters = statusFilter !== 'all' || timeFilter !== 'all' || searchQuery.trim() !== '';

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
            Clone History
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
              Loading history...
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
            Clone History
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

  // Empty state (no records at all)
  if (records.length === 0) {
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
            Clone History
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
              margin: 0,
            }}>
              No clone history yet.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const successCount = records.filter(r => r.status === 'ok').length;

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
            Clone History
          </h2>
          <p style={{
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-sans)',
            margin: 'var(--space-1) 0 0 0',
          }}>
            {hasActiveFilters
              ? `${filteredRecords.length} of ${records.length} records`
              : `${records.length} record${records.length !== 1 ? 's' : ''} \u00b7 ${successCount} successful`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {!confirmClearAll ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmClearAll(true)}>
              Clear All
            </Button>
          ) : (
            <>
              <Button variant="destructive" size="sm" onClick={handleClearAll}>
                Yes, Clear
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmClearAll(false)}>
                Cancel
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search by UID, source, or target type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
        />
        <SearchIcon />
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}>
        <SegmentedControl
          options={[
            { label: 'All', value: 'all' },
            { label: 'Success', value: 'success' },
            { label: 'Failed', value: 'failed' },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <SegmentedControl
          options={[
            { label: 'All Time', value: 'all' },
            { label: '7 Days', value: '7d' },
            { label: '30 Days', value: '30d' },
          ]}
          value={timeFilter}
          onChange={(v) => setTimeFilter(v as TimeFilter)}
        />
      </div>

      {/* Empty filter state */}
      {filteredRecords.length === 0 && hasActiveFilters && (
        <Card>
          <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              No records match your filters
            </p>
          </div>
        </Card>
      )}

      {/* Record list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {filteredRecords.map(rec => (
          <Card key={rec.id}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}>
              {/* Left side: info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Source -> Target */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-2)',
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {rec.source}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-quaternary)', flexShrink: 0 }}>
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {rec.target}
                  </span>
                </div>
                {/* UID + Date */}
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <span style={rowLabelStyle}>UID </span>
                    <span style={rowValueStyle}>{rec.sourceUid}</span>
                  </div>
                  <div>
                    <span style={rowLabelStyle}>Date </span>
                    <span style={{ ...rowValueStyle, fontFamily: 'var(--font-sans)', fontWeight: 400 }}>{rec.date}</span>
                  </div>
                </div>
              </div>

              {/* Right side: status badge + delete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                <Badge
                  variant={rec.status === 'ok' ? 'success' : 'error'}
                  label={rec.status === 'ok' ? 'Success' : 'Failed'}
                />
                {confirmDeleteId === rec.id ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleDelete(rec.id)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--error)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--text-secondary)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(rec.id)}
                    title="Delete record"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-quaternary)',
                      transition: 'color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-quaternary)'; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
