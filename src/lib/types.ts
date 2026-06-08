export type ColumnKind =
  | 'integer'
  | 'real'
  | 'text'
  | 'blob'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'unknown';

export interface ForeignKey {
  /** column in this table */
  from: string;
  /** referenced table */
  table: string;
  /** referenced column */
  to: string;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
  /** human label for the bucket range */
  label: string;
}

export interface TopValue {
  value: unknown;
  count: number;
}

export interface ColumnProfile {
  name: string;
  declaredType: string;
  kind: ColumnKind;
  pk: boolean;
  notNull: boolean;
  fk?: ForeignKey;
  /** non-null value count */
  count: number;
  nullCount: number;
  distinctCount: number;
  /** fraction of rows that are null, 0..1 */
  nullFraction: number;
  min?: number | string;
  max?: number | string;
  avg?: number;
  topValues?: TopValue[];
  histogram?: HistogramBin[];
  /** suggested visualization for this column */
  chart: 'bar' | 'histogram' | 'none';
  /** 0..1 heuristic of how "interesting" this column is to chart/explore */
  interest: number;
}

export interface TableProfile {
  name: string;
  type: 'table' | 'view';
  sql: string;
  rowCount: number;
  columns: ColumnProfile[];
  foreignKeys: ForeignKey[];
  indexes: IndexInfo[];
  sampleRows: Record<string, unknown>[];
}

/** Open the row-inspector overlay with a set of full rows. */
export type InspectFn = (data: {
  title: string;
  rows: Record<string, unknown>[];
  /** total matches when `rows` is a capped subset */
  total?: number;
}) => void;

/** Navigation target within the app. */
export type Nav =
  | { view: 'overview' }
  | { view: 'sql' }
  | { view: 'table'; table: string }
  | { view: 'column'; table: string; column: string };

export type NavigateFn = (nav: Nav) => void;

export interface ProgressEvent {
  done: number;
  total: number;
  label: string;
}

export interface DatabaseProfile {
  fileName: string;
  fileSize: number;
  tables: TableProfile[];
  views: TableProfile[];
  totalRows: number;
  /** edges for the relationship graph */
  relationships: { from: string; to: string; columns: string }[];
}
