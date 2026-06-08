<script lang="ts">
  import type { DbClient } from '../lib/client';
  import type { TableProfile } from '../lib/types';
  import { formatNumber } from '../lib/format';
  import ColumnProfile from './ColumnProfile.svelte';
  import DataTable from './DataTable.svelte';

  export let table: TableProfile;
  export let client: DbClient;

  type Tab = 'profile' | 'data' | 'schema';
  let tab: Tab = 'profile';

  $: columnNames = table.columns.map((c) => c.name);
</script>

<div class="detail">
  <div class="head">
    <div class="title">
      <h2>{table.name}</h2>
      <span class="type-pill" class:view={table.type === 'view'}>{table.type}</span>
    </div>
    <div class="stats">
      <span><strong>{formatNumber(table.rowCount)}</strong> rows</span>
      <span><strong>{table.columns.length}</strong> cols</span>
      {#if table.foreignKeys.length}<span><strong>{table.foreignKeys.length}</strong> FK</span>{/if}
      {#if table.indexes.length}<span><strong>{table.indexes.length}</strong> idx</span>{/if}
    </div>
  </div>

  <div class="tabs">
    <button class:active={tab === 'profile'} on:click={() => (tab = 'profile')}>Columns</button>
    <button class:active={tab === 'data'} on:click={() => (tab = 'data')}>Data</button>
    <button class:active={tab === 'schema'} on:click={() => (tab = 'schema')}>Schema</button>
  </div>

  {#if tab === 'profile'}
    <div class="cols-grid">
      {#each table.columns as col}
        <ColumnProfile {col} {client} table={table.name} rowCount={table.rowCount} />
      {/each}
    </div>
  {:else if tab === 'data'}
    <p class="note">Showing first {table.sampleRows.length} of {formatNumber(table.rowCount)} rows</p>
    <DataTable columns={columnNames} rows={table.sampleRows} label={table.name} />
  {:else}
    <div class="schema">
      {#if table.foreignKeys.length}
        <div class="block">
          <h4>Foreign keys</h4>
          {#each table.foreignKeys as fk}
            <div class="fk-row mono">{fk.from} → <span class="ref">{fk.table}.{fk.to}</span></div>
          {/each}
        </div>
      {/if}
      {#if table.indexes.length}
        <div class="block">
          <h4>Indexes</h4>
          {#each table.indexes as idx}
            <div class="fk-row mono">
              {#if idx.unique}<span class="uniq">UNIQUE</span>{/if}
              {idx.name} <span class="ref">({idx.columns.join(', ')})</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="block">
        <h4>DDL</h4>
        <pre>{table.sql}</pre>
      </div>
    </div>
  {/if}
</div>

<style>
  .detail { display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .title { display: flex; align-items: center; gap: 10px; }
  h2 { font-size: 22px; font-family: var(--mono); }
  .type-pill {
    font-size: 10px; font-family: var(--mono); text-transform: uppercase;
    padding: 2px 8px; border-radius: 20px; background: var(--accent-soft); color: var(--accent);
  }
  .type-pill.view { background: #bc8cff22; color: var(--purple); }
  .stats { display: flex; gap: 16px; color: var(--text-dim); font-size: 13px; }
  .stats strong { color: var(--text); font-family: var(--mono); }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
  .tabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    border-radius: 0; padding: 8px 14px; color: var(--text-dim); font-weight: 500;
  }
  .tabs button:hover { color: var(--text); background: none; }
  .tabs button.active { color: var(--text); border-bottom-color: var(--accent); }

  .cols-grid {
    display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .note { color: var(--text-faint); font-size: 12px; margin: 0; }

  .schema { display: flex; flex-direction: column; gap: 18px; }
  .block h4 { color: var(--text-dim); margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .fk-row { font-size: 12px; padding: 3px 0; color: var(--text-dim); }
  .ref { color: var(--accent); }
  .uniq { color: var(--amber); font-size: 10px; margin-right: 4px; }
  pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px; overflow: auto; font-family: var(--mono); font-size: 12px;
    color: var(--text-dim); margin: 0; line-height: 1.6;
  }
</style>
