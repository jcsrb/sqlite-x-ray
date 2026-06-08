import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// Vite resolves this to a served URL for the wasm binary.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  }
  return sqlPromise;
}

export async function openDatabase(bytes: Uint8Array): Promise<Database> {
  const SQL = await getSql();
  return new SQL.Database(bytes);
}

/**
 * Read a dropped file into bytes, transparently gunzipping it if it's gzip-
 * compressed (detected by the 1f 8b magic bytes, so a `.gz` extension isn't
 * required). Uses the browser-native DecompressionStream — no dependency.
 */
export async function readDatabaseFile(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzip(bytes);
  }
  return bytes;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress gzip files (no DecompressionStream).');
  }
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Run a query and return rows as plain objects. */
export function queryAll(
  db: Database,
  sql: string,
  params: Record<string, unknown> | unknown[] = [],
): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as never);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/** Run a query returning a single scalar from the first row/column. */
export function queryScalar<T = unknown>(
  db: Database,
  sql: string,
  params: Record<string, unknown> | unknown[] = [],
): T | undefined {
  const rows = queryAll(db, sql, params);
  if (rows.length === 0) return undefined;
  const first = rows[0];
  const keys = Object.keys(first);
  return keys.length ? (first[keys[0]] as T) : undefined;
}

/** Quote an identifier (table/column) for safe interpolation. */
export function ident(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}
