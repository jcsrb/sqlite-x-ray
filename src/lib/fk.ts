import type { ForeignKey } from './types';

/** Foreign keys collapsed to one entry per key (composite keys are one entry). */
export function uniqueKeys(fks: ForeignKey[]): ForeignKey[] {
  const seen = new Set<number>();
  return fks.filter((fk) => !seen.has(fk.id) && (seen.add(fk.id), true));
}

/** "col" for a single-column key, "(a, b)" for a composite one. */
export function keyCols(cols: string[]): string {
  return cols.length === 1 ? cols[0] : `(${cols.join(', ')})`;
}

/** "parent.id" / "parent.(a, b)" — what a key points at. */
export function fkTarget(fk: ForeignKey): string {
  return `${fk.table}.${keyCols(fk.pairs.map((p) => p.to))}`;
}

