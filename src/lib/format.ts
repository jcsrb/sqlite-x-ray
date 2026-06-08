export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatCompact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Render any cell value for display in tables. */
export function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (v instanceof Uint8Array) return `‹blob ${v.length}B›`;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}

export function isUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
}

export function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function percent(frac: number): string {
  return `${(frac * 100).toFixed(frac > 0 && frac < 0.01 ? 2 : 0)}%`;
}
