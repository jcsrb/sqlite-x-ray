import type { DatabaseProfile, ProgressEvent } from './types';

/**
 * Main-thread handle to the database Worker. All queries are async; the sql.js
 * Database lives in the worker so heavy profiling/queries don't freeze the UI.
 */
export class DbClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (rows: Record<string, unknown>[]) => void; reject: (e: Error) => void }>();
  private openResolve: ((p: DatabaseProfile) => void) | null = null;
  private openReject: ((e: Error) => void) | null = null;
  private onProgress: ((p: ProgressEvent) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.handle(e.data);
  }

  private handle(m: any) {
    switch (m?.type) {
      case 'progress':
        this.onProgress?.({ done: m.done, total: m.total, label: m.label });
        break;
      case 'opened':
        this.openResolve?.(m.profile);
        this.openResolve = this.openReject = null;
        break;
      case 'openError':
        this.openReject?.(new Error(m.message));
        this.openResolve = this.openReject = null;
        break;
      case 'result': {
        const p = this.pending.get(m.id);
        if (p) { p.resolve(m.rows); this.pending.delete(m.id); }
        break;
      }
      case 'queryError': {
        const p = this.pending.get(m.id);
        if (p) { p.reject(new Error(m.message)); this.pending.delete(m.id); }
        break;
      }
    }
  }

  /** Open a database from raw bytes and run the full profiling pass. */
  open(bytes: Uint8Array, fileName: string, fileSize: number, onProgress?: (p: ProgressEvent) => void): Promise<DatabaseProfile> {
    this.onProgress = onProgress ?? null;
    return new Promise<DatabaseProfile>((resolve, reject) => {
      this.openResolve = resolve;
      this.openReject = reject;
      // Transfer the buffer to avoid copying a potentially large file.
      this.worker.postMessage({ type: 'open', bytes: bytes.buffer, fileName, fileSize }, [bytes.buffer]);
    });
  }

  /** Run a query, resolving with rows as plain objects. */
  query(sql: string, params: Record<string, unknown> | unknown[] = []): Promise<Record<string, unknown>[]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'query', id, sql, params });
    });
  }

  /** Convenience: first column of the first row. */
  async scalar<T = unknown>(sql: string, params: Record<string, unknown> | unknown[] = []): Promise<T | undefined> {
    const rows = await this.query(sql, params);
    if (!rows.length) return undefined;
    const keys = Object.keys(rows[0]);
    return keys.length ? (rows[0][keys[0]] as T) : undefined;
  }

  close() {
    this.worker.terminate();
    this.pending.clear();
  }
}
