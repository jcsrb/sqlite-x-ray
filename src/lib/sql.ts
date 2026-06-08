import { ident } from './db';

/** Render a JS value as a SQLite literal for inlining into a visible query. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Uint8Array) return "''"; // blobs aren't usefully drillable
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** A WHERE predicate matching `col` to `v` (handles NULL). */
export function whereEq(col: string, v: unknown): string {
  if (v === null || v === undefined) return `${ident(col)} IS NULL`;
  return `${ident(col)} = ${sqlLiteral(v)}`;
}

/** A self-contained SELECT for rows where `col` = `v`. */
export function buildSelect(table: string, col: string, v: unknown, limit = 200): string {
  return `SELECT *\nFROM ${ident(table)}\nWHERE ${whereEq(col, v)}\nLIMIT ${limit};`;
}

/** A COUNT for how many rows share this value. */
export function buildCount(table: string, col: string, v: unknown): string {
  return `SELECT COUNT(*) FROM ${ident(table)} WHERE ${whereEq(col, v)}`;
}

/** Blobs / undefined aren't worth drilling into. */
export function drillable(v: unknown): boolean {
  return !(v instanceof Uint8Array);
}

const DEFAULT_LIMIT = 200;

export function selectWhere(table: string, where: string, limit = DEFAULT_LIMIT): string {
  return `SELECT *\nFROM ${ident(table)}\nWHERE ${where}\nLIMIT ${limit};`;
}

/** Frequency of each value, most common first. */
export function groupByCount(table: string, col: string, limit = 50): string {
  return `SELECT ${ident(col)} AS value, COUNT(*) AS count\nFROM ${ident(table)}\nGROUP BY ${ident(col)}\nORDER BY count DESC\nLIMIT ${limit};`;
}

export function distinctValues(table: string, col: string, limit = DEFAULT_LIMIT): string {
  return `SELECT DISTINCT ${ident(col)}\nFROM ${ident(table)}\nORDER BY ${ident(col)}\nLIMIT ${limit};`;
}

export function orderByCol(table: string, col: string, dir: 'ASC' | 'DESC', limit = DEFAULT_LIMIT): string {
  return `SELECT *\nFROM ${ident(table)}\nORDER BY ${ident(col)} ${dir}\nLIMIT ${limit};`;
}

export function nullRows(table: string, col: string, limit = DEFAULT_LIMIT): string {
  return `SELECT *\nFROM ${ident(table)}\nWHERE ${ident(col)} IS NULL\nLIMIT ${limit};`;
}

/** Drill a numeric histogram bucket: values in [lo, hi). */
export function numericRange(table: string, col: string, lo: number, hi: number, last: boolean): string {
  const upper = last ? `${ident(col)} <= ${hi}` : `${ident(col)} < ${hi}`;
  return selectWhere(table, `${ident(col)} >= ${lo} AND ${upper}`);
}

/** Drill a date histogram bucket: rows whose strftime(fmt) matches the label. */
export function dateBucket(table: string, col: string, fmt: string, label: string): string {
  return selectWhere(table, `strftime('${fmt}', ${ident(col)}) = ${sqlLiteral(label)}`);
}
