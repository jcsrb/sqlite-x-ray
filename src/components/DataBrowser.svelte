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
    page = 0; sortCol = ''; sortDir = 'asc'; filter = ''; debounced = '';
  }

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
    const conds = columns.map((c) => `CAST(${ident(c)} AS TEXT) LIKE $q`).join(' OR ');
    return { clause: `WHERE ${conds}`, params: { $q: `%${debounced}%` } };
  }

  // Reload whenever the query inputs change.
  $: void load(table.name, page, sortCol, sortDir, debounced);
  async function load(tableName: string, p: number, sc: string, sd: string, _q: string) {
    loading = true;
    try {
      const { clause, params } = buildWhere();
      const order = sc ? `ORDER BY ${ident(sc)} ${sd === 'asc' ? 'ASC' : 'DESC'}` : '';
      total = (await client.scalar<number>(`SELECT COUNT(*) FROM ${ident(tableName)} ${clause}`, params)) ?? 0;
      rows = await client.query(
        `SELECT * FROM ${ident(tableName)} ${clause} ${order} LIMIT ${PAGE} OFFSET ${p * PAGE}`,
        params,
      );
    } finally {
      loading = false;
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
