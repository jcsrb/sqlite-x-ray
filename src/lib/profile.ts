import type { Database } from 'sql.js';
import { queryAll, queryScalar, ident } from './db';
import { percent } from './format';
import type {
  ColumnKind,
  ColumnProfile,
  DatabaseProfile,
  Finding,
  ForeignKey,
  HistogramBin,
  IndexInfo,
  TableProfile,
  TopValue,
} from './types';

const SAMPLE_ROWS = 50;
const TOP_VALUES = 12;
const HISTOGRAM_BINS = 24;
/** Above this distinct count we don't enumerate top values for categorical display. */
const CATEGORICAL_MAX_DISTINCT = 40;
/**
 * Text columns whose distinct count is at/above this fraction of non-null rows are
 * treated as essentially unique (IDs, titles, URLs) — a top-values chart is
 * meaningless, so we show sample chips + length range instead. Below it, even
 * high-cardinality text is usually skewed (e.g. county, address), so a top-N bar
 * chart of the most frequent values is informative.
 */
const NEAR_UNIQUE_RATIO = 0.95;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

/** Map a declared SQLite type to a coarse affinity-based kind. */
function affinity(declared: string): ColumnKind {
  const t = declared.toUpperCase();
  if (!t) return 'unknown';
  if (t.includes('BOOL')) return 'boolean';
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'datetime';
  if (t.includes('DATE') || t.includes('TIME')) return 'date';
  if (t.includes('INT')) return 'integer';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'text';
  if (t.includes('BLOB')) return 'blob';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'real';
  return 'unknown';
}

/** Refine the kind by inspecting actual sample values (SQLite is dynamically typed). */
function refineKind(declared: string, samples: unknown[]): ColumnKind {
  let kind = affinity(declared);
  const nonNull = samples.filter((v) => v !== null && v !== undefined);
  if (nonNull.length === 0) return kind;

  // Detect dates stored as TEXT.
  if (kind === 'text' || kind === 'unknown') {
    const allDates = nonNull.every(
      (v) => typeof v === 'string' && ISO_DATE.test(v),
    );
    if (allDates) {
      const hasTime = nonNull.some(
        (v) => typeof v === 'string' && /[T ]\d{2}:\d{2}/.test(v),
      );
      return hasTime ? 'datetime' : 'date';
    }
  }

  // NB: boolean refinement for integer columns is done in profileColumn using the
  // full column's distinct count + min/max — a 25-row sample is too easily fooled
  // (e.g. early rows of a counter that happen to be 0/1).

  // Fall back to runtime types when declaration is empty/unknown.
  if (kind === 'unknown') {
    const v = nonNull[0];
    if (typeof v === 'number') kind = Number.isInteger(v) ? 'integer' : 'real';
    else if (typeof v === 'string') kind = 'text';
    else if (v instanceof Uint8Array) kind = 'blob';
  }
  return kind;
}

function isNumericKind(k: ColumnKind): boolean {
  return k === 'integer' || k === 'real';
}

function listTables(db: Database): { name: string; sql: string; type: 'table' | 'view' }[] {
  const rows = queryAll(
    db,
    `SELECT name, sql, type FROM sqlite_master
     WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  );
  return rows.map((r) => ({
    name: String(r.name),
    sql: String(r.sql ?? ''),
    type: r.type === 'view' ? 'view' : 'table',
  }));
}

function getForeignKeys(db: Database, table: string): ForeignKey[] {
  const rows = queryAll(db, `PRAGMA foreign_key_list(${ident(table)})`);
  return rows.map((r) => ({
    from: String(r.from),
    table: String(r.table),
    to: String(r.to),
  }));
}

function getIndexes(db: Database, table: string): IndexInfo[] {
  const list = queryAll(db, `PRAGMA index_list(${ident(table)})`);
  return list.map((idx) => {
    const cols = queryAll(db, `PRAGMA index_info(${ident(String(idx.name))})`);
    return {
      name: String(idx.name),
      unique: idx.unique === 1,
      columns: cols.map((c) => String(c.name)),
    };
  });
}

function buildHistogram(
  db: Database,
  table: string,
  column: string,
  min: number,
  max: number,
): HistogramBin[] | undefined {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return undefined;
  const range = max - min;
  const bins = HISTOGRAM_BINS;
  // Bucket index in SQL, clamped to [0, bins-1].
  const rows = queryAll(
    db,
    `SELECT CAST(MIN($bins - 1, ($col - $min) * $bins / $range) AS INTEGER) AS b,
            COUNT(*) AS c
     FROM ${ident(table)}
     WHERE ${ident(column)} IS NOT NULL
     GROUP BY b ORDER BY b`.replace(/\$col/g, ident(column)),
    { $bins: bins, $min: min, $range: range },
  );
  const counts = new Array(bins).fill(0);
  for (const r of rows) {
    const b = Math.max(0, Math.min(bins - 1, Number(r.b)));
    counts[b] += Number(r.c);
  }
  const binSize = range / bins;
  return counts.map((count, i) => {
    const lo = min + i * binSize;
    const hi = i === bins - 1 ? max : lo + binSize;
    return { lo, hi, count, label: `${fmtNum(lo)} – ${fmtNum(hi)}` };
  });
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type DateGrain = 'year' | 'month' | 'day';

/**
 * Histogram for date/datetime columns: bucket over time using SQLite's date
 * functions. Granularity adapts to the span (year for decades, month for a few
 * years, day for short ranges) and empty buckets are filled so the timeline reads
 * continuously. Values SQLite can't parse as dates are ignored.
 */
function buildDateHistogram(
  db: Database,
  table: string,
  column: string,
): HistogramBin[] | undefined {
  const cq = ident(column);
  const tq = ident(table);
  const span = queryAll(
    db,
    `SELECT MIN(julianday(${cq})) AS mn, MAX(julianday(${cq})) AS mx
     FROM ${tq} WHERE julianday(${cq}) IS NOT NULL`,
  )[0];
  const mn = Number(span?.mn);
  const mx = Number(span?.mx);
  if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx < mn) return undefined;

  const spanDays = mx - mn;
  let grain: DateGrain;
  let fmt: string;
  if (spanDays > 366 * 4) {
    grain = 'year';
    fmt = '%Y';
  } else if (spanDays > 75) {
    grain = 'month';
    fmt = '%Y-%m';
  } else {
    grain = 'day';
    fmt = '%Y-%m-%d';
  }

  const rows = queryAll(
    db,
    `SELECT strftime('${fmt}', ${cq}) AS b, COUNT(*) AS c
     FROM ${tq}
     WHERE strftime('${fmt}', ${cq}) IS NOT NULL
     GROUP BY b ORDER BY b`,
  );
  if (!rows.length) return undefined;

  const counts = new Map(rows.map((r) => [String(r.b), Number(r.c)]));
  const keys = enumerateBuckets(String(rows[0].b), String(rows[rows.length - 1].b), grain);
  return keys.map((k, i) => ({ lo: i, hi: i + 1, count: counts.get(k) ?? 0, label: k, dateFmt: fmt }));
}

/** Ordered, gap-filled bucket keys between two formatted endpoints (capped). */
function enumerateBuckets(first: string, last: string, grain: DateGrain): string[] {
  const MAX = 400;
  const out: string[] = [];
  if (grain === 'year') {
    const a = parseInt(first, 10);
    const b = parseInt(last, 10);
    for (let y = a; y <= b && out.length < MAX; y++) out.push(String(y));
  } else if (grain === 'month') {
    let [y, m] = first.split('-').map(Number);
    const [by, bm] = last.split('-').map(Number);
    while ((y < by || (y === by && m <= bm)) && out.length < MAX) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      if (++m > 12) { m = 1; y++; }
    }
  } else {
    const d = new Date(first + 'T00:00:00Z');
    const end = new Date(last + 'T00:00:00Z');
    while (d <= end && out.length < MAX) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

function profileColumn(
  db: Database,
  table: string,
  col: { name: string; type: string; pk: number; notnull: number },
  rowCount: number,
  fkMap: Map<string, ForeignKey>,
): ColumnProfile {
  const name = col.name;
  const tq = ident(table);
  const cq = ident(name);

  // One scan computes every scalar aggregate we need (non-null count, distinct
  // count, distinct storage types among non-nulls, and min/max/avg). Doing these
  // as separate queries meant ~5 full-table scans per column — brutal on large
  // tables. typeof() of a NULL is 'null', so the CASE keeps it out of the count.
  const agg = queryAll(
    db,
    `SELECT
       COUNT(${cq}) AS nn,
       COUNT(DISTINCT ${cq}) AS dc,
       COUNT(DISTINCT CASE WHEN ${cq} IS NOT NULL THEN typeof(${cq}) END) AS st,
       MIN(${cq}) AS mn, MAX(${cq}) AS mx, AVG(${cq}) AS av
     FROM ${tq}`,
  )[0] ?? {};
  const nonNull = Number(agg.nn) || 0;
  const distinct = Number(agg.dc) || 0;
  const storageTypes = Number(agg.st) || 0;
  const nullCount = rowCount - nonNull;

  const samples = queryAll(
    db,
    `SELECT ${cq} AS v FROM ${tq} WHERE ${cq} IS NOT NULL LIMIT 25`,
  ).map((r) => r.v);
  let kind = refineKind(col.type, samples);

  // An integer column is boolean only if it has ≤2 distinct values, all in {0,1}.
  // (Declared BOOL types are already 'boolean' via affinity.) Uses the min/max
  // already computed above — no extra scan.
  if (kind === 'integer' && distinct > 0 && distinct <= 2) {
    if (Number(agg.mn) >= 0 && Number(agg.mx) <= 1) kind = 'boolean';
  }

  const profile: ColumnProfile = {
    name,
    declaredType: col.type || '(none)',
    kind,
    pk: col.pk > 0,
    notNull: col.notnull === 1,
    fk: fkMap.get(name),
    count: nonNull,
    nullCount,
    distinctCount: distinct,
    nullFraction: rowCount > 0 ? nullCount / rowCount : 0,
    chart: 'none',
    interest: 0,
    storageTypes,
  };

  if (nonNull === 0) return profile;

  if (isNumericKind(kind)) {
    profile.min = agg.mn as number;
    profile.max = agg.mx as number;
    profile.avg = agg.av != null ? Number(agg.av) : undefined;

    // Few distinct numeric values → treat as categorical bars; otherwise histogram.
    if (distinct > 1 && distinct <= 15) {
      profile.topValues = topValues(db, table, name);
      profile.chart = 'bar';
    } else {
      const hist = buildHistogram(db, table, name, Number(agg.mn), Number(agg.mx));
      if (hist) {
        profile.histogram = hist;
        profile.chart = 'histogram';
      }
    }
  } else if (kind === 'date' || kind === 'datetime') {
    profile.min = agg.mn as string;
    profile.max = agg.mx as string;
    profile.topValues = topValues(db, table, name);
    // Few distinct dates → categorical bars; otherwise a time histogram.
    if (distinct > 1 && distinct <= CATEGORICAL_MAX_DISTINCT) {
      profile.chart = 'bar';
    } else {
      const hist = buildDateHistogram(db, table, name);
      if (hist) {
        profile.histogram = hist;
        profile.chart = 'histogram';
      }
    }
  } else if (kind === 'boolean') {
    profile.topValues = topValues(db, table, name);
    profile.chart = 'bar';
  } else if (kind === 'text') {
    // Essentially-unique text (IDs, titles, URLs): chips + length range, no chart.
    // Otherwise show a top-N bar chart — even high-cardinality text is usually
    // skewed enough that the most frequent values are worth ranking.
    const nearUnique = distinct >= nonNull * NEAR_UNIQUE_RATIO;
    if (distinct > 1 && !nearUnique) {
      profile.topValues = topValues(db, table, name);
      profile.chart = 'bar';
    } else {
      const lens = queryAll(
        db,
        `SELECT MIN(LENGTH(${cq})) AS mn, MAX(LENGTH(${cq})) AS mx FROM ${tq}`,
      )[0];
      profile.min = lens?.mn != null ? `len ${lens.mn}` : undefined;
      profile.max = lens?.mx != null ? `len ${lens.mx}` : undefined;
      profile.topValues = topValues(db, table, name, 6);
    }
  }

  profile.interest = interestScore(profile);
  return profile;
}

/**
 * Heuristic 0..1 for how "interesting" a column is to explore/chart.
 * Rewards clear distributions (categorical sweet spot, real histograms),
 * penalizes all-null, constant, and ID-like columns; small FK/boolean bonuses.
 */
function interestScore(c: ColumnProfile): number {
  if (c.count === 0) return 0; // entirely null
  if (c.distinctCount <= 1) return 0.05; // constant

  let score: number;
  if (c.chart === 'bar') {
    // categorical sweet spot ~2..30 distinct
    const d = c.distinctCount;
    const cat = d <= 30 ? 1 : d <= 100 ? 0.65 : 0.4;
    score = 0.7 * cat;
  } else if (c.chart === 'histogram') {
    score = c.kind === 'date' || c.kind === 'datetime' ? 0.78 : 0.7;
  } else {
    // chips / no chart: ID-like (near-unique) is dull, repeated text less so
    score = c.distinctCount / c.count > 0.95 ? 0.12 : 0.4;
  }

  if (c.fk) score += 0.15; // relationships connect the data
  if (c.kind === 'boolean') score += 0.05;

  // weight by how populated the column is
  score *= 0.45 + 0.55 * (1 - c.nullFraction);
  return Math.max(0, Math.min(1, score));
}

function topValues(db: Database, table: string, column: string, limit = TOP_VALUES): TopValue[] {
  const rows = queryAll(
    db,
    `SELECT ${ident(column)} AS value, COUNT(*) AS count
     FROM ${ident(table)}
     WHERE ${ident(column)} IS NOT NULL
     GROUP BY ${ident(column)}
     ORDER BY count DESC, value ASC
     LIMIT ${limit}`,
  );
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}

function profileTable(
  db: Database,
  meta: { name: string; sql: string; type: 'table' | 'view' },
  onColumn?: (colName: string) => void,
): TableProfile {
  const { name } = meta;
  const cols = queryAll(db, `PRAGMA table_info(${ident(name)})`) as unknown as {
    name: string;
    type: string;
    pk: number;
    notnull: number;
  }[];

  const rowCount = queryScalar<number>(db, `SELECT COUNT(*) FROM ${ident(name)}`) ?? 0;
  const foreignKeys = meta.type === 'table' ? getForeignKeys(db, name) : [];
  const fkMap = new Map(foreignKeys.map((fk) => [fk.from, fk]));
  const indexes = meta.type === 'table' ? getIndexes(db, name) : [];

  const columns: ColumnProfile[] = [];
  for (const c of cols) {
    onColumn?.(c.name);
    columns.push(profileColumn(db, name, c, rowCount, fkMap));
  }

  const sampleRows = queryAll(
    db,
    `SELECT * FROM ${ident(name)} LIMIT ${SAMPLE_ROWS}`,
  );

  return { name, type: meta.type, sql: meta.sql, rowCount, columns, foreignKeys, indexes, sampleRows };
}

export type ProgressFn = (done: number, total: number, label: string) => void;

export function profileDatabase(
  db: Database,
  fileName: string,
  fileSize: number,
  onProgress?: ProgressFn,
): DatabaseProfile {
  const entries = listTables(db);

  // Progress is tracked per *column*: one big table (e.g. 685k rows × 15 cols)
  // does most of the work, so per-table progress would freeze on it. Count all
  // columns up front (cheap PRAGMAs) for a meaningful total, then tick per column.
  let total = 0;
  for (const e of entries) total += queryAll(db, `PRAGMA table_info(${ident(e.name)})`).length;

  let done = 0;
  const profiles: TableProfile[] = entries.map((e) =>
    profileTable(db, e, (colName) => {
      onProgress?.(done, total, `${e.name}.${colName}`);
      done++;
    }),
  );

  onProgress?.(total, total, 'analyzing relationships…');
  const tables = profiles.filter((p) => p.type === 'table');
  const views = profiles.filter((p) => p.type === 'view');

  const relationships = tables.flatMap((t) =>
    t.foreignKeys.map((fk) => ({
      from: t.name,
      to: fk.table,
      columns: `${fk.from} → ${fk.to}`,
    })),
  );

  return {
    fileName,
    fileSize,
    tables,
    views,
    totalRows: tables.reduce((sum, t) => sum + t.rowCount, 0),
    relationships,
    findings: computeFindings(db, tables),
  };
}

const HIGH_NULL = 0.6;

/** Data-quality x-ray: referential integrity + per-column smells. */
function computeFindings(db: Database, tables: TableProfile[]): Finding[] {
  const findings: Finding[] = [];
  const tableNames = new Set(tables.map((t) => t.name));

  for (const t of tables) {
    if (t.rowCount === 0) continue;

    // Orphaned foreign keys — values with no matching parent row.
    for (const fk of t.foreignKeys) {
      if (!tableNames.has(fk.table)) {
        findings.push({
          severity: 'high', kind: 'orphan-fk', table: t.name, column: fk.from,
          message: `${t.name}.${fk.from} references missing table ${fk.table}`,
        });
        continue;
      }
      try {
        const orphans = queryScalar<number>(
          db,
          `SELECT COUNT(*) FROM ${ident(t.name)} c
           WHERE c.${ident(fk.from)} IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM ${ident(fk.table)} p WHERE p.${ident(fk.to)} = c.${ident(fk.from)})`,
        ) ?? 0;
        if (orphans > 0) {
          findings.push({
            severity: 'high', kind: 'orphan-fk', table: t.name, column: fk.from,
            message: `${fmtNum(orphans)} orphaned ${fk.from} value${orphans === 1 ? '' : 's'} in ${t.name}`,
            detail: `→ ${fk.table}.${fk.to} (no matching parent row)`,
          });
        }
      } catch {
        /* ignore — odd FK shapes (composite, etc.) */
      }
    }

    // Per-column smells.
    for (const c of t.columns) {
      if (c.count === 0) {
        findings.push({ severity: 'warn', kind: 'empty', table: t.name, column: c.name, message: `${t.name}.${c.name} is entirely empty (100% null)` });
      } else if (c.distinctCount === 1) {
        findings.push({ severity: 'info', kind: 'constant', table: t.name, column: c.name, message: `${t.name}.${c.name} has a single constant value` });
      } else if (c.nullFraction >= HIGH_NULL) {
        findings.push({ severity: 'warn', kind: 'high-null', table: t.name, column: c.name, message: `${t.name}.${c.name} is ${percent(c.nullFraction)} null` });
      }
      if (c.storageTypes > 1) {
        findings.push({ severity: 'warn', kind: 'mixed-type', table: t.name, column: c.name, message: `${t.name}.${c.name} mixes ${c.storageTypes} storage types`, detail: 'values stored as different SQLite types' });
      }
    }
  }

  const rank: Record<string, number> = { high: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
