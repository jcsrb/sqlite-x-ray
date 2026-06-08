/// <reference lib="webworker" />
import type { Database } from 'sql.js';
import { openDatabase, queryAll } from './db';
import { profileDatabase } from './profile';

// Worker that owns the sql.js Database so profiling and queries never block the
// main thread. Communicates via structured messages (see client.ts for the API).

let db: Database | null = null;

type InMsg =
  | { type: 'open'; bytes: ArrayBuffer; fileName: string; fileSize: number }
  | { type: 'query'; id: number; sql: string; params?: Record<string, unknown> | unknown[] };

self.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  if (m.type === 'open') {
    void handleOpen(m);
  } else if (m.type === 'query') {
    handleQuery(m);
  }
};

async function handleOpen(m: { bytes: ArrayBuffer; fileName: string; fileSize: number }) {
  try {
    db?.close();
    db = await openDatabase(new Uint8Array(m.bytes));
    const profile = profileDatabase(db, m.fileName, m.fileSize, (done, total, label) => {
      self.postMessage({ type: 'progress', done, total, label });
    });
    self.postMessage({ type: 'opened', profile });
  } catch (err) {
    self.postMessage({ type: 'openError', message: err instanceof Error ? err.message : String(err) });
  }
}

function handleQuery(m: { id: number; sql: string; params?: Record<string, unknown> | unknown[] }) {
  if (!db) {
    self.postMessage({ type: 'queryError', id: m.id, message: 'No database open' });
    return;
  }
  try {
    const rows = queryAll(db, m.sql, m.params ?? []);
    self.postMessage({ type: 'result', id: m.id, rows });
  } catch (err) {
    self.postMessage({ type: 'queryError', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
}
