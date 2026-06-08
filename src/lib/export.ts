import type { DatabaseProfile, TableProfile } from './types';
import { formatBytes } from './format';

/** Trigger a client-side file download. */
export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The profile as JSON. Sample rows are dropped to keep the report focused on structure. */
export function profileToJson(profile: DatabaseProfile): string {
  const slim = {
    ...profile,
    tables: profile.tables.map(stripSamples),
    views: profile.views.map(stripSamples),
  };
  return JSON.stringify(slim, null, 2);
}

function stripSamples(t: TableProfile) {
  const { sampleRows, ...rest } = t;
  void sampleRows;
  return rest;
}

/** A human-readable Markdown report of the database x-ray. */
export function profileToMarkdown(profile: DatabaseProfile): string {
  const L: string[] = [];
  L.push(`# SQLite X-Ray — ${profile.fileName}`, '');
  L.push(
    `- **Tables:** ${profile.tables.length}`,
    `- **Views:** ${profile.views.length}`,
    `- **Total rows:** ${profile.totalRows.toLocaleString()}`,
    `- **File size:** ${formatBytes(profile.fileSize)}`,
    `- **Relationships:** ${profile.relationships.length}`,
    '',
  );

  if (profile.findings.length) {
    L.push('## Data quality', '');
    for (const f of profile.findings) {
      const tag = f.severity.toUpperCase();
      L.push(`- **[${tag}]** ${f.message}${f.detail ? ` — ${f.detail}` : ''}`);
    }
    L.push('');
  }

  if (profile.relationships.length) {
    L.push('## Relationships', '');
    for (const r of profile.relationships) L.push(`- ${r.from} → ${r.to} (${r.columns})`);
    L.push('');
  }

  for (const t of [...profile.tables, ...profile.views]) {
    L.push(`## ${t.name} (${t.type}) — ${t.rowCount.toLocaleString()} rows`, '');
    L.push('| Column | Type | Kind | Distinct | Null % | Min | Max |');
    L.push('|---|---|---|--:|--:|---|---|');
    for (const c of t.columns) {
      const mark = c.pk ? ' 🔑' : c.fk ? ' 🔗' : '';
      L.push(
        `| ${c.name}${mark} | ${c.declaredType} | ${c.kind} | ${c.distinctCount.toLocaleString()} | ` +
          `${Math.round(c.nullFraction * 100)}% | ${fmt(c.min)} | ${fmt(c.max)} |`,
      );
    }
    L.push('');
  }

  return L.join('\n');
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\|/g, '\\|');
}
