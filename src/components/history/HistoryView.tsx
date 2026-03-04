import { useEffect, useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { InlineNotice } from '../shared/InlineNotice';
import { getHistory } from '../../lib/api';
import type { CloneRecord } from '../../machines/types';

interface HistoryRecord {
  id: number;
  source: string;
  target: string;
  uid: string;
  date: string;
  status: 'ok' | 'fail';
}

function formatLocalTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.replace('T', ' ').slice(0, 19);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Map backend CloneRecord to display HistoryRecord */
function toHistoryRecord(r: CloneRecord, index: number): HistoryRecord {
  return {
    id: index + 1,
    source: r.source_type,
    target: r.target_type,
    uid: r.source_uid || '---',
    date: formatLocalTime(r.timestamp),
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

export function HistoryView() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleRefresh = () => setRefreshKey((k) => k + 1);

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
          <Button variant="secondary" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
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
            {records.length} record{records.length !== 1 ? 's' : ''} &middot; {successCount} successful
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          Refresh
        </Button>
      </div>

      {/* Record list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {records.map(rec => (
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
                    <span style={rowValueStyle}>{rec.uid}</span>
                  </div>
                  <div>
                    <span style={rowLabelStyle}>Date </span>
                    <span style={{ ...rowValueStyle, fontFamily: 'var(--font-sans)', fontWeight: 400 }}>{rec.date}</span>
                  </div>
                </div>
              </div>

              {/* Right side: status badge */}
              <Badge
                variant={rec.status === 'ok' ? 'success' : 'error'}
                label={rec.status === 'ok' ? 'Success' : 'Failed'}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
