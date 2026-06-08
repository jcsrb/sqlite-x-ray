<script lang="ts">
  import { getContext } from 'svelte';
  import type { Database } from 'sql.js';
  import type { ColumnProfile, TableProfile, InspectFn, NavigateFn, TopValue } from '../lib/types';
  import { queryAll, queryScalar, ident } from '../lib/db';
  import { formatCell, formatNumber, formatCompact, percent, isUrl } from '../lib/format';
  import BarChart from './BarChart.svelte';
  import Histogram from './Histogram.svelte';
  import NullBar from './NullBar.svelte';

  export let db: Database;
  export let table: TableProfile;
  export let col: ColumnProfile;

  const inspect = getContext<InspectFn>('inspect');
  const navigate = getContext<NavigateFn>('navigate');

  const MATCH_LIMIT = 100;
  const BIG_TOP = 30;

  // Re-query a richer set of top values for the enlarged bar chart.
  $: bigTop =
    col.chart === 'bar' || (col.topValues && col.topValues.length)
      ? (queryAll(
          db,
          `SELECT ${ident(col.name)} AS value, COUNT(*) AS count
           FROM ${ident(table.name)}
           WHERE ${ident(col.name)} IS NOT NULL
           GROUP BY ${ident(col.name)}
           ORDER BY count DESC, value ASC
           LIMIT ${BIG_TOP}`,
        ).map((r) => ({ value: r.value, count: Number(r.count) })) as TopValue[])
      : [];

  function viewRows(value: unknown) {
    const where = `WHERE ${ident(col.name)} = $v`;
    const rows = queryAll(db, `SELECT * FROM ${ident(table.name)} ${where} LIMIT ${MATCH_LIMIT}`, { $v: value as never });
    const total = queryScalar<number>(db, `SELECT COUNT(*) FROM ${ident(table.name)} ${where}`, { $v: value as never });
    inspect({ title: `${col.name} = ${formatCell(value)}`, rows, total });
  }

  const kindColor: Record<string, string> = {
    integer: 'var(--accent)', real: 'var(--accent)', text: 'var(--green)',
    date: 'var(--pink)', datetime: 'var(--pink)', boolean: 'var(--amber)',
    blob: 'var(--text-faint)', unknown: 'var(--text-faint)',
  };
</script>

<div class="col-view">
  <div class="crumbs">
    <button class="crumb" on:click={() => navigate({ view: 'table', table: table.name })}>{table.name}</button>
    <span class="slash">/</span>
    <span class="crumb cur mono">{col.name}</span>
  </div>

  <div class="header">
    <h1 class="mono">{col.name}</h1>
    <div class="badges">
      <span class="kind" style="color: {kindColor[col.kind]}">{col.kind}</span>
      {#if col.pk}<span class="pill pk">PK</span>{/if}
      {#if col.fk}
        <button class="pill fk" on:click={() => col.fk && navigate({ view: 'table', table: col.fk.table })} title="go to {col.fk.table}">
          FK → {col.fk.table}.{col.fk.to}
        </button>
      {/if}
      {#if col.count > 0 && col.distinctCount === col.count && !col.pk}<span class="pill uniq">unique</span>{/if}
    </div>
  </div>

  <div class="stats">
    <div class="stat"><span class="n">{formatNumber(col.count)}</span><span class="l">non-null</span></div>
    <div class="stat"><span class="n">{formatCompact(col.distinctCount)}</span><span class="l">distinct</span></div>
    <div class="stat"><span class="n" class:warn={col.nullFraction > 0.5}>{percent(col.nullFraction)}</span><span class="l">null</span></div>
    {#if col.min !== undefined}<div class="stat"><span class="n sm mono">{formatCell(col.min)}</span><span class="l">min</span></div>{/if}
    {#if col.max !== undefined}<div class="stat"><span class="n sm mono">{formatCell(col.max)}</span><span class="l">max</span></div>{/if}
    {#if col.avg !== undefined}<div class="stat"><span class="n sm mono">{col.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><span class="l">avg</span></div>{/if}
    <div class="stat"><span class="n sm">{col.declaredType}</span><span class="l">declared</span></div>
  </div>

  <NullBar nullFraction={col.nullFraction} />

  <div class="panel">
    {#if col.chart === 'histogram' && col.histogram}
      <h3>Distribution</h3>
      <div class="big-hist"><Histogram bins={col.histogram} /></div>
    {:else if bigTop.length}
      <h3>Top values <span class="muted">(click a bar to view rows)</span></h3>
      <BarChart data={bigTop} total={col.count} clickable on:select={(e) => viewRows(e.detail)} />
    {:else}
      <p class="muted">No distribution to chart — values are essentially unique.</p>
    {/if}
  </div>
</div>

<style>
  .col-view { display: flex; flex-direction: column; gap: 18px; }
  .crumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .crumb { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; font-size: 13px; }
  .crumb:hover { text-decoration: underline; }
  .crumb.cur { color: var(--text-dim); cursor: default; }
  .slash { color: var(--text-faint); }

  .header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  h1 { font-size: 26px; }
  .badges { display: flex; align-items: center; gap: 8px; }
  .kind { font-family: var(--mono); font-size: 13px; font-weight: 600; }
  button.pill { cursor: pointer; }
  button.pill:hover { filter: brightness(1.2); }
  .pill.uniq { color: var(--green); border-color: #3fb95055; background: #3fb9501a; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .stat { background: var(--bg-elev2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 2px; }
  .n { font-size: 20px; font-weight: 700; font-family: var(--mono); }
  .n.sm { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n.warn { color: var(--amber); }
  .l { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; }

  .panel { background: var(--bg-elev2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .panel h3 { font-size: 13px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 12px; }
  .big-hist { height: 160px; display: flex; flex-direction: column; justify-content: flex-end; }
  .big-hist :global(.cols) { height: 140px; }
</style>
