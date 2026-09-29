<script lang="ts">
  import type { DbClient } from '../lib/client';
  import type { TableProfile } from '../lib/types';
  import { ident } from '../lib/db';
  import { formatNumber } from '../lib/format';
  import DataTable from './DataTable.svelte';

  export let client: DbClient;
  export let table: TableProfile;

  const PAGE = 100;
  let page = 0;
  let sortCol = '';
  let sortDir: 'asc' | 'desc' = 'asc';
  let filter = '';
  let debounced = '';
  let rows: Record<string, unknown>[] = [];
  let total = 0;
  let loading = false;
  let timer: ReturnType<typeof setTimeout>;

  $: columns = table.columns.map((c) => c.name);
  $: pages = Math.max(1, Math.ceil(total / PAGE));

  // Reset to first page when table changes.
  $: if (table) resetForTable();
  function resetForTable() {
    clearTimeout(timer);
    page = 0; sortCol = ''; sortDir = 'asc'; filter = ''; debounced = '';
    filteredCounts = new Map();
  }

  // The unfiltered total is known from the profile; a filtered total is counted
  // once per filter string, not again on every page or sort change.
  let filteredCounts = new Map<string, number>();

  function onFilter() {
    clearTimeout(timer);
    timer = setTimeout(() => { debounced = filter; page = 0; }, 250);
  }

  function onSort(col: string) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'asc'; }
    page = 0;
  }

  function buildWhere(): { clause: string; params: Record<string, unknown> } {
    if (!debounced.trim()) return { clause: '', params: {} };
    // Escape LIKE wildcards so a typed % or _ matches literally.
    const conds = columns.map((c) => `CAST(${ident(c)} AS TEXT) LIKE $q ESCAPE '!'`).join(' OR ');
    return { clause: `WHERE ${conds}`, params: { $q: `%${debounced.replace(/[!%_]/g, '!$&')}%` } };
  }

  // Reload whenever the query inputs change.
  $: void load(table.name, page, sortCol, sortDir, debounced);
  // A stable row key for tables that have one (not views or WITHOUT ROWID
  // tables), under whichever rowid alias no real column shadows.
  $: rowKey =
    table.type === 'table' && !/\bWITHOUT\s+ROWID\b/i.test(table.sql)
      ? ['rowid', '_rowid_', 'oid'].find((a) => !columns.some((c) => c.toLowerCase() === a)) ?? null
      : null;

  // Responses can arrive out of order (a slow filtered count, then a fast page),
  // so only the latest load may write its results.
  let loadSeq = 0;
  async function load(tableName: string, p: number, sc: string, sd: string, q: string) {
    const seq = ++loadSeq;
    loading = true;
    try {
      const { clause, params } = buildWhere();
      let n = clause ? filteredCounts.get(q) : table.rowCount;
      if (n === undefined) {
        n = (await client.scalar<number>(`SELECT COUNT(*) FROM ${ident(tableName)} ${clause}`, params)) ?? 0;
        filteredCounts.set(q, n);
      }

      // OFFSET makes SQLite produce and discard every row before the page — for a
      // sorted or filtered page near the end of a big table, nearly all of them.
      // Pages in the back half are read from the other end instead (order
      // reversed, small offset, rows flipped back). The row key breaks ties so
      // both directions are exact mirrors.
      const asc = sd === 'asc';
      const orderBy = (forward: boolean) => {
        const parts: string[] = [];
        if (sc) parts.push(`${ident(sc)} ${asc === forward ? 'ASC' : 'DESC'}`);
        if (rowKey) parts.push(`${rowKey} ${forward ? 'ASC' : 'DESC'}`);
        return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
      };
      const fromEnd = n - (p + 1) * PAGE;
      const reverse = rowKey !== null && fromEnd < p * PAGE;
      const limit = reverse ? PAGE + Math.min(0, fromEnd) : PAGE;
      const offset = reverse ? Math.max(0, fromEnd) : p * PAGE;
      const got = await client.query(
        `SELECT * FROM ${ident(tableName)} ${clause} ${orderBy(!reverse)} LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      const page = reverse ? got.reverse() : got;
      if (seq !== loadSeq) return;
      total = n;
      rows = page;
    } catch {
      /* database closed while loading */
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: from = total === 0 ? 0 : page * PAGE + 1;
  $: to = Math.min(total, (page + 1) * PAGE);
</script>

<div class="browser">
  <div class="bar">
    <input
      class="filter"
      placeholder="Filter all columns…"
      bind:value={filter}
      on:input={onFilter}
      spellcheck="false"
    />
    <div class="pager">
      <span class="info mono">{formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}{#if loading} · …{/if}</span>
      <button on:click={() => (page = 0)} disabled={page === 0}>«</button>
      <button on:click={() => (page = Math.max(0, page - 1))} disabled={page === 0}>‹</button>
      <span class="info mono">{page + 1}/{formatNumber(pages)}</span>
      <button on:click={() => (page = Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>›</button>
      <button on:click={() => (page = pages - 1)} disabled={page >= pages - 1}>»</button>
    </div>
  </div>

  <DataTable {columns} {rows} label={table.name} table={table.name} startIndex={from} sortable {sortCol} {sortDir} on:sort={(e) => onSort(e.detail)} />
</div>

<style>
  .browser { display: flex; flex-direction: column; gap: 10px; }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .filter {
    flex: 1; min-width: 200px; max-width: 360px; background: var(--bg-elev2); color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; font-family: var(--mono); font-size: 13px; outline: none;
  }
  .filter:focus { border-color: var(--accent); }
  .pager { display: flex; align-items: center; gap: 6px; }
  .pager button { padding: 4px 10px; }
  .info { font-size: 12px; color: var(--text-faint); }
</style>
