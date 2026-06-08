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
