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
  const pct = frac * 100;
  // Never round a non-zero value down to 0% or a sub-100 value up to 100% —
  // "100% null" next to thousands of values reads as a bug.
  if (pct <= 0) return '0%';
  if (pct >= 100) return '100%';
  if (pct < 1) return '<1%';
  if (pct > 99) return '>99%';
  return `${Math.round(pct)}%`;
}
