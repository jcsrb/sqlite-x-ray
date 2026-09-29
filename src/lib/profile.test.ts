import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { profileDatabase } from './profile';

let SQL: SqlJsStatic;

beforeAll(async () => {
  // vitest runs from the project root.
  SQL = await initSqlJs({ locateFile: (f) => `node_modules/sql.js/dist/${f}` });
});

function db(ddl: string): Database {
  const d = new SQL.Database();
  d.run(ddl);
  return d;
}

const profile = (d: Database) => profileDatabase(d, 'test.db', 0);

describe('profileDatabase', () => {
  it('profiles tables whose names need quoting', () => {
    const p = profile(db(`
      CREATE TABLE "we""ird table" ("select" INTEGER, "a b" TEXT);
      INSERT INTO "we""ird table" VALUES (1, 'x'), (2, 'y'), (2, NULL);
    `));
    const t = p.tables[0];
    expect(t.name).toBe('we"ird table');
    expect(t.rowCount).toBe(3);
    expect(t.columns.map((c) => c.name)).toEqual(['select', 'a b']);
    expect(t.columns[1].nullCount).toBe(1);
  });

  it('keeps user tables that merely start with "sqlite"', () => {
    const p = profile(db(`CREATE TABLE sqlite3_data (x); CREATE TABLE sqlitex (y);`));
    expect(p.tables.map((t) => t.name)).toEqual(['sqlite3_data', 'sqlitex']);
  });

  it('survives a broken view instead of rejecting the whole database', () => {
    const p = profile(db(`
      CREATE TABLE gone (id INTEGER);
      CREATE TABLE ok (id INTEGER); INSERT INTO ok VALUES (1);
      CREATE VIEW v AS SELECT * FROM gone;
      DROP TABLE gone;
    `));
    expect(p.tables.map((t) => t.name)).toEqual(['ok']);
    expect(p.tables[0].rowCount).toBe(1);
    expect(p.views[0].name).toBe('v');
    expect(p.views[0].error).toMatch(/no such table/);
    expect(p.findings.some((f) => f.kind === 'unreadable' && f.table === 'v')).toBe(true);
  });

  it('marks virtual tables of unavailable modules unreadable and hides their shadow tables', () => {
    // Simulate an FTS5 table from a DB built elsewhere: the module isn't compiled
    // into this sql.js build, so write the schema rows directly.
    const d = db(`CREATE TABLE notes (id INTEGER, body TEXT);`);
    d.run('PRAGMA writable_schema = ON');
    d.run(`INSERT INTO sqlite_master (type, name, tbl_name, rootpage, sql)
           VALUES ('table', 'ft', 'ft', 0, 'CREATE VIRTUAL TABLE ft USING nosuchmodule(body)')`);
    d.run('PRAGMA writable_schema = OFF');
    // Re-open so the schema change is picked up.
    const reopened = new SQL.Database(d.export());
    reopened.run(`CREATE TABLE ft_data (id INTEGER); CREATE TABLE ft_idx (id INTEGER); CREATE TABLE ft_config (k, v);`);

    const p = profile(reopened);
    const names = p.tables.map((t) => t.name);
    expect(names).toContain('notes');
    expect(names).toContain('ft');
    expect(names).not.toContain('ft_data');
    expect(names).not.toContain('ft_idx');
    expect(names).not.toContain('ft_config');
    expect(p.tables.find((t) => t.name === 'ft')?.error).toMatch(/no such module/);
  });

  it('resolves foreign keys that reference the parent primary key implicitly', () => {
    const p = profile(db(`
      CREATE TABLE parent (pk INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE child (id INTEGER, pid INTEGER REFERENCES parent);
      INSERT INTO parent VALUES (1, 'a');
      INSERT INTO child VALUES (1, 1), (2, 99);
    `));
    const child = p.tables.find((t) => t.name === 'child')!;
    expect(child.foreignKeys).toEqual([{ from: 'pid', table: 'parent', to: 'pk' }]);
    const orphan = p.findings.find((f) => f.kind === 'orphan-fk');
    expect(orphan?.message).toMatch(/^1 orphaned pid value in child/);
  });

  it('handles empty tables', () => {
    const p = profile(db(`CREATE TABLE e (a INTEGER, b TEXT);`));
    expect(p.tables[0].rowCount).toBe(0);
    expect(p.tables[0].columns.every((c) => c.count === 0)).toBe(true);
  });
});
