<script lang="ts">
  import { getContext } from 'svelte';
  import type { DbClient } from '../lib/client';
  import type { ColumnProfile, InspectFn, NavigateFn } from '../lib/types';
  import { formatCompact, formatCell, isUrl } from '../lib/format';
  import { ident } from '../lib/db';
  import { buildSelect } from '../lib/sql';
  import BarChart from './BarChart.svelte';
  import Histogram from './Histogram.svelte';
  import NullBar from './NullBar.svelte';

  export let col: ColumnProfile;
  export let client: DbClient;
  export let table: string;
  export let rowCount = 0;

  const inspect = getContext<InspectFn>('inspect');
  const navigate = getContext<NavigateFn>('navigate');

  /** Every non-null value is unique (IDs, etc.) — worth flagging in the UI. */
  $: allDistinct = col.count > 0 && col.distinctCount === col.count;

  const MATCH_LIMIT = 100;

  /** Show the full rows where this column equals the clicked value. */
  async function viewRows(value: unknown) {
    const where = `WHERE ${ident(col.name)} = $v`;
    const rows = await client.query(
      `SELECT * FROM ${ident(table)} ${where} LIMIT ${MATCH_LIMIT}`,
      { $v: value as never },
    );
    const total = await client.scalar<number>(
      `SELECT COUNT(*) FROM ${ident(table)} ${where}`,
      { $v: value as never },
    );
    inspect({ title: `${col.name} = ${formatCell(value)}`, rows, total, table, sql: buildSelect(table, col.name, value) });
  }

  const kindColor: Record<string, string> = {
    integer: 'var(--accent)',
    real: 'var(--accent)',
    text: 'var(--green)',
    date: 'var(--pink)',
    datetime: 'var(--pink)',
    boolean: 'var(--amber)',
    blob: 'var(--text-faint)',
    unknown: 'var(--text-faint)',
  };
</script>

<div class="col-card">
  <div class="head">
    <div class="name-line">
      <button class="name" on:click={() => navigate({ view: 'column', table, column: col.name })} title="Open column view">{col.name}</button>
      {#if col.pk}<span class="pill pk">PK</span>{/if}
      {#if col.fk}<span class="pill fk" title="→ {col.fk.table}.{col.fk.to}">FK</span>{/if}
      {#if allDistinct && !col.pk}<span class="pill uniq" title="every value is distinct">unique</span>{/if}
    </div>
    <span class="kind" style="color: {kindColor[col.kind]}">{col.kind}</span>
  </div>

  <div class="meta">
    <span title="declared type">{col.declaredType}</span>
    <span class="sep">·</span>
    <span title="distinct values">{formatCompact(col.distinctCount)} distinct</span>
    {#if col.min !== undefined && col.max !== undefined}
      <span class="sep">·</span>
      <span title="range">{formatCell(col.min)} → {formatCell(col.max)}</span>
    {/if}
    {#if col.avg !== undefined}
      <span class="sep">·</span>
      <span title="average">avg {col.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
    {/if}
  </div>

  <NullBar nullFraction={col.nullFraction} />

  <div class="chart">
    {#if col.chart === 'histogram' && col.histogram}
      <Histogram bins={col.histogram} />
    {:else if col.chart === 'bar' && col.topValues}
      <BarChart data={col.topValues} total={rowCount} clickable on:select={(e) => viewRows(e.detail)} />
    {:else if col.topValues && col.topValues.length}
      <div class="samples">
        {#if allDistinct}
          <span class="hint">all {formatCompact(col.count)} values distinct · sample:</span>
        {/if}
        {#each col.topValues.slice(0, 6) as t}
          {#if isUrl(t.value)}
            <a class="chip link" href={t.value} target="_blank" rel="noopener noreferrer" title={formatCell(t.value)}>{formatCell(t.value)}</a>
          {:else}
            <button class="chip" title="{formatCell(t.value)} — click to view rows" on:click={() => viewRows(t.value)}>{formatCell(t.value)}</button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="empty">no distribution</div>
    {/if}
  </div>
</div>

<style>
  .col-card {
    background: var(--bg-elev2);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .name-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .name {
    font-weight: 600; font-family: var(--mono); font-size: 13px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: none; border: none; padding: 0; color: var(--text); cursor: pointer; text-align: left;
  }
  .name:hover { color: var(--accent); text-decoration: underline; }
  .kind { font-family: var(--mono); font-size: 11px; font-weight: 600; }
  .meta { font-size: 11px; color: var(--text-faint); font-family: var(--mono); display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .sep { opacity: 0.4; }
  .chart { margin-top: 2px; min-height: 20px; }
  .samples { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .hint { font-size: 10px; color: var(--text-faint); font-style: italic; width: 100%; }
  .chip {
    display: inline-block; font-family: var(--mono); font-size: 10px; color: var(--text-dim);
    background: var(--bg); border: 1px solid var(--border-soft); border-radius: 5px;
    padding: 2px 6px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    line-height: 1.3; text-decoration: none; cursor: pointer;
  }
  .chip:hover { border-color: var(--accent); color: var(--text); }
  .chip.link { color: var(--accent); }
  .chip.link:hover { text-decoration: underline; }
  .pill.uniq { color: var(--green); border-color: #3fb95055; background: #3fb9501a; }
  .empty { font-size: 11px; color: var(--text-faint); font-style: italic; }
</style>
