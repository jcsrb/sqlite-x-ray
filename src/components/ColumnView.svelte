<script lang="ts">
  import { getContext } from 'svelte';
  import type { DbClient } from '../lib/client';
  import type { ColumnProfile, TableProfile, InspectFn, NavigateFn, RunSqlFn, Finding, HistogramBin, TopValue } from '../lib/types';
  import { ident } from '../lib/db';
  import { buildSelect, groupByCount, distinctValues, orderByCol, nullRows, numericRange, dateBucket } from '../lib/sql';
  import { formatCell, formatNumber, formatCompact, percent, isUrl } from '../lib/format';
  import BarChart from './BarChart.svelte';
  import Histogram from './Histogram.svelte';
  import NullBar from './NullBar.svelte';

  export let client: DbClient;
  export let table: TableProfile;
  export let col: ColumnProfile;
  export let findings: Finding[] = [];

  const inspect = getContext<InspectFn>('inspect');
  const navigate = getContext<NavigateFn>('navigate');
  const runSql = getContext<RunSqlFn>('runSql');

  const MATCH_LIMIT = 100;
  const BIG_TOP = 30;

  $: isNumeric = col.kind === 'integer' || col.kind === 'real';
  $: isDate = col.kind === 'date' || col.kind === 'datetime';

  // Extended, kind-aware statistics — computed lazily when the column opens.
  interface Extra { label: string; value: string }
  let extra: Extra[] = [];
  let bigTop: TopValue[] = [];

  $: void load(table.name, col.name, col.kind);

  async function load(tableName: string, colName: string, _kind: string) {
    extra = [];
    bigTop = [];
    await Promise.all([loadBigTop(tableName, colName), loadExtra(tableName, colName)]);
  }

  async function loadBigTop(tableName: string, colName: string) {
    if (!(col.chart === 'bar' || (col.topValues && col.topValues.length))) return;
    const rows = await client.query(
      `SELECT ${ident(colName)} AS value, COUNT(*) AS count
       FROM ${ident(tableName)} WHERE ${ident(colName)} IS NOT NULL
       GROUP BY ${ident(colName)} ORDER BY count DESC, value ASC LIMIT ${BIG_TOP}`,
    );
    bigTop = rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  }

  async function quantile(tableName: string, colName: string, p: number, n: number): Promise<unknown> {
    const off = Math.max(0, Math.round(p * (n - 1)));
    return client.scalar(
      `SELECT ${ident(colName)} FROM ${ident(tableName)} WHERE ${ident(colName)} IS NOT NULL ORDER BY ${ident(colName)} LIMIT 1 OFFSET ${off}`,
    );
  }

  async function loadExtra(tableName: string, colName: string) {
    const cq = ident(colName);
    const tq = ident(tableName);
    const n = col.count;
    const out: Extra[] = [];

    if (isNumeric && n > 0) {
      const s = (await client.query(`SELECT SUM(${cq}) sum, AVG(${cq}*${cq}) sq, AVG(${cq}) av FROM ${tq}`))[0];
      const variance = Number(s?.sq) - Number(s?.av) ** 2;
      const std = variance > 0 ? Math.sqrt(variance) : 0;
      const [p25, p50, p75] = await Promise.all([
        quantile(tableName, colName, 0.25, n),
        quantile(tableName, colName, 0.5, n),
        quantile(tableName, colName, 0.75, n),
      ]);
      out.push(
        { label: 'median', value: fmtN(p50) },
        { label: 'p25', value: fmtN(p25) },
        { label: 'p75', value: fmtN(p75) },
        { label: 'std dev', value: std.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
        { label: 'sum', value: fmtN(s?.sum) },
      );
    } else if (isDate && n > 0) {
      const med = await quantile(tableName, colName, 0.5, n);
      out.push({ label: 'median', value: formatCell(med) });
      const days = await client.scalar<number>(`SELECT COUNT(DISTINCT date(${cq})) FROM ${tq} WHERE ${cq} IS NOT NULL`);
      if (days != null) out.push({ label: 'distinct days', value: formatNumber(days) });
      const span = spanLabel(col.min, col.max);
      if (span) out.push({ label: 'time span', value: span });
    } else if (col.kind === 'text' && n > 0) {
      const s = (await client.query(`SELECT MIN(LENGTH(${cq})) mn, MAX(LENGTH(${cq})) mx, AVG(LENGTH(${cq})) av FROM ${tq} WHERE ${cq} IS NOT NULL`))[0];
      out.push(
        { label: 'min length', value: String(s?.mn ?? '') },
        { label: 'avg length', value: Number(s?.av ?? 0).toFixed(1) },
        { label: 'max length', value: String(s?.mx ?? '') },
      );
      const empty = await client.scalar<number>(`SELECT COUNT(*) FROM ${tq} WHERE ${cq} = ''`);
      if (empty) out.push({ label: "empty ''", value: formatNumber(empty) });
    }

    if (n > 0) out.push({ label: 'uniqueness', value: percent(col.distinctCount / n) });
    extra = out;
  }

  function fmtN(v: unknown): string {
    if (v == null) return '—';
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);
  }

  function spanLabel(min: unknown, max: unknown): string | null {
    const a = new Date(String(min)).getTime();
    const b = new Date(String(max)).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    const days = (b - a) / 86_400_000;
    if (days > 730) return `${(days / 365.25).toFixed(1)} years`;
    if (days > 60) return `${Math.round(days / 30.44)} months`;
    return `${Math.round(days)} days`;
  }

  async function viewRows(value: unknown) {
    const where = `WHERE ${ident(col.name)} = $v`;
    const rows = await client.query(`SELECT * FROM ${ident(table.name)} ${where} LIMIT ${MATCH_LIMIT}`, { $v: value as never });
    const total = await client.scalar<number>(`SELECT COUNT(*) FROM ${ident(table.name)} ${where}`, { $v: value as never });
    inspect({ title: `${col.name} = ${formatCell(value)}`, rows, total, table: table.name, sql: buildSelect(table.name, col.name, value) });
  }

  // Drill a histogram bucket into the SQL console.
  function bucketDrill(bin: HistogramBin, last: boolean) {
    if (bin.dateFmt) runSql(dateBucket(table.name, col.name, bin.dateFmt, bin.label));
    else runSql(numericRange(table.name, col.name, bin.lo, bin.hi, last));
  }

  type Action = { label: string; sql: () => string; show?: boolean };
  $: actions = [
    { label: 'Top 20 by count', sql: () => groupByCount(table.name, col.name, 20) },
    { label: 'Distinct values', sql: () => distinctValues(table.name, col.name) },
    { label: 'Sort ↓', sql: () => orderByCol(table.name, col.name, 'DESC') },
    { label: 'Sort ↑', sql: () => orderByCol(table.name, col.name, 'ASC') },
    { label: 'Rows where null', sql: () => nullRows(table.name, col.name), show: col.nullCount > 0 },
  ].filter((a: Action) => a.show !== false);

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
    {#each extra as e}
      <div class="stat"><span class="n sm mono">{e.value}</span><span class="l">{e.label}</span></div>
    {/each}
    <div class="stat"><span class="n sm">{col.declaredType}</span><span class="l">declared</span></div>
  </div>

  <NullBar nullFraction={col.nullFraction} />

  {#if findings.length}
    <div class="flags">
      {#each findings as f}
        <span class="flag {f.severity}">⚠ {f.message}{#if f.detail} · {f.detail}{/if}</span>
      {/each}
    </div>
  {/if}

  <div class="actions">
    <span class="a-label">Query this column:</span>
    {#each actions as a}
      <button class="action mono" on:click={() => runSql(a.sql())}>{a.label}</button>
    {/each}
  </div>

  <div class="panel">
    {#if col.chart === 'histogram' && col.histogram}
      <h3>Distribution <span class="muted">(click a bar to view those rows)</span></h3>
      <div class="big-hist">
        <Histogram
          bins={col.histogram}
          clickable
          on:select={(e) => bucketDrill(e.detail, col.histogram ? e.detail === col.histogram[col.histogram.length - 1] : false)}
        />
      </div>
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

  .flags { display: flex; flex-direction: column; gap: 6px; }
  .flag {
    font-size: 12px; padding: 6px 12px; border-radius: 8px; border-left: 3px solid var(--amber);
    background: var(--bg-elev2); color: var(--text-dim);
  }
  .flag.high { border-left-color: var(--red); }
  .flag.info { border-left-color: var(--text-faint); }

  .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .a-label { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; }
  .action {
    font-size: 12px; padding: 5px 11px; background: var(--bg-elev2);
    border: 1px solid var(--border); border-radius: 7px; color: var(--text-dim); cursor: pointer;
  }
  .action:hover { border-color: var(--accent); color: var(--text); }

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
