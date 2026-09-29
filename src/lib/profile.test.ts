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
    expect(child.foreignKeys).toEqual([
      { id: 0, from: 'pid', table: 'parent', to: 'pk', pairs: [{ from: 'pid', to: 'pk' }] },
    ]);
    const orphan = p.findings.find((f) => f.kind === 'orphan-fk');
    expect(orphan?.message).toMatch(/^1 orphaned pid value in child/);
  });

  it('checks composite foreign keys as one key', () => {
    const p = profile(db(`
      CREATE TABLE parent (a INTEGER, b INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE child (id INTEGER, x INTEGER, y INTEGER, FOREIGN KEY (x, y) REFERENCES parent (a, b));
      INSERT INTO parent VALUES (1, 1), (2, 2);
      -- (1,2) has no parent even though x=1 and y=2 each exist on their own;
      -- (NULL, 5) is skipped because a composite key with a NULL isn't enforced.
      INSERT INTO child VALUES (1, 1, 1), (2, 2, 2), (3, 1, 2), (4, NULL, 5);
    `));
    const child = p.tables.find((t) => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(2);
    expect(child.foreignKeys[0].pairs).toEqual([{ from: 'x', to: 'a' }, { from: 'y', to: 'b' }]);
    expect(p.relationships).toEqual([{ from: 'child', to: 'parent', columns: '(x, y) → (a, b)' }]);
    const orphans = p.findings.filter((f) => f.kind === 'orphan-fk');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toMatch(/^1 orphaned \(x, y\) value in child/);
  });

  it('resolves an implicit composite primary key reference', () => {
    const p = profile(db(`
      CREATE TABLE parent (a INTEGER, b INTEGER, PRIMARY KEY (b, a));
      CREATE TABLE child (x INTEGER, y INTEGER, FOREIGN KEY (x, y) REFERENCES parent);
    `));
    const fk = p.tables.find((t) => t.name === 'child')!.foreignKeys[0];
    expect(fk.pairs).toEqual([{ from: 'x', to: 'b' }, { from: 'y', to: 'a' }]);
  });

  it('profiles generated columns', () => {
    const p = profile(db(`
      CREATE TABLE g (a INTEGER, b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL, c TEXT AS (a || 'x') STORED);
      INSERT INTO g (a) VALUES (1), (2), (3);
    `));
    const cols = p.tables[0].columns;
    expect(cols.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    expect(cols.map((c) => !!c.generated)).toEqual([false, true, true]);
    expect(cols[1].max).toBe(6);
  });

  it('profiles tables whose names clash with internal query names', () => {
    const p = profile(db(`CREATE TABLE g (v TEXT, n INTEGER); INSERT INTO g VALUES ('a', 1), ('a', 2), ('b', 3);`));
    expect(p.tables[0].error).toBeUndefined();
    expect(p.tables[0].columns[0].topValues).toEqual([{ value: 'a', count: 2 }, { value: 'b', count: 1 }]);
  });

  it('uses the schema to skip grouping unique columns, but not partial unique ones', () => {
    const p = profile(db(`
      CREATE TABLE u (id INTEGER PRIMARY KEY, code TEXT UNIQUE, tag TEXT);
      CREATE UNIQUE INDEX u_tag ON u (tag) WHERE tag <> 'dup';
      INSERT INTO u VALUES (3, 'c', 'dup'), (1, 'a', 'dup'), (2, NULL, 'x');
    `));
    const [id, code, tag] = p.tables[0].columns;
    expect(id.distinctCount).toBe(3);
    expect(id.topValues).toEqual([{ value: 1, count: 1 }, { value: 2, count: 1 }, { value: 3, count: 1 }]);
    expect(code.count).toBe(2);
    expect(code.distinctCount).toBe(2);
    // 'dup' is excluded from the partial unique index, so it can repeat.
    expect(tag.distinctCount).toBe(2);
    expect(tag.topValues?.[0]).toEqual({ value: 'dup', count: 2 });
  });

  it('handles empty tables', () => {
    const p = profile(db(`CREATE TABLE e (a INTEGER, b TEXT);`));
    expect(p.tables[0].rowCount).toBe(0);
    expect(p.tables[0].columns.every((c) => c.count === 0)).toBe(true);
  });
});
