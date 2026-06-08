<script lang="ts">
  import { getContext } from 'svelte';
  import type { DatabaseProfile, TableProfile, ColumnProfile, NavigateFn } from '../lib/types';
  import { formatBytes, formatNumber, formatCompact } from '../lib/format';
  import BarChart from './BarChart.svelte';
  import Histogram from './Histogram.svelte';
  import RelationshipMap from './RelationshipMap.svelte';

  export let profile: DatabaseProfile;

  const navigate = getContext<NavigateFn>('navigate');

  $: columnCount = profile.tables.reduce((s, t) => s + t.columns.length, 0);

  // DB-wide "juiciest" columns — those with a real chart and high interest.
  $: highlights = profile.tables
    .flatMap((t) => t.columns.map((col) => ({ table: t, col })))
    .filter((x) => x.col.chart !== 'none' && x.col.interest >= 0.4)
    .sort((a, b) => b.col.interest - a.col.interest)
    .slice(0, 9);

  function tableScore(t: TableProfile): number {
    const top = [...t.columns].sort((a, b) => b.interest - a.interest).slice(0, 3);
    const avgTop = top.reduce((s, c) => s + c.interest, 0) / (top.length || 1);
    const rowsW = Math.min(1, Math.log10((t.rowCount || 0) + 1) / 6); // ~1M rows → 1
    return avgTop * 0.7 + rowsW * 0.3;
  }

  $: tables = profile.tables
    .map((t) => ({
      t,
      score: tableScore(t),
      topCols: [...t.columns].sort((a, b) => b.interest - a.interest).filter((c) => c.interest > 0.12).slice(0, 6),
    }))
    .sort((a, b) => b.score - a.score);

  const kindColor: Record<string, string> = {
    integer: 'var(--accent)', real: 'var(--accent)', text: 'var(--green)',
    date: 'var(--pink)', datetime: 'var(--pink)', boolean: 'var(--amber)',
    blob: 'var(--text-faint)', unknown: 'var(--text-faint)',
  };

  const goTable = (t: string) => navigate({ view: 'table', table: t });
  const goCol = (t: string, c: string) => navigate({ view: 'column', table: t, column: c });
</script>

<div class="overview">
  <div class="stat-grid">
    <div class="stat"><span class="num">{profile.tables.length}</span><span class="lbl">Tables</span></div>
    <div class="stat"><span class="num">{profile.views.length}</span><span class="lbl">Views</span></div>
    <div class="stat"><span class="num">{formatCompact(profile.totalRows)}</span><span class="lbl">Total rows</span></div>
    <div class="stat"><span class="num">{columnCount}</span><span class="lbl">Columns</span></div>
    <div class="stat"><span class="num">{profile.relationships.length}</span><span class="lbl">Relationships</span></div>
    <div class="stat"><span class="num">{formatBytes(profile.fileSize)}</span><span class="lbl">File size</span></div>
  </div>

  {#if highlights.length}
    <div class="section">
      <h3>✨ Highlights <span class="muted">— most interesting columns to explore</span></h3>
      <div class="hl-grid">
        {#each highlights as h}
          <button class="hl-card" on:click={() => goCol(h.table.name, h.col.name)} title="Open {h.table.name}.{h.col.name}">
            <div class="hl-head">
              <span class="hl-col mono">{h.col.name}</span>
              <span class="hl-kind" style="color: {kindColor[h.col.kind]}">{h.col.kind}</span>
            </div>
            <div class="hl-table mono">{h.table.name}</div>
            <div class="hl-chart">
              {#if h.col.chart === 'histogram' && h.col.histogram}
                <Histogram bins={h.col.histogram} />
              {:else if h.col.topValues}
                <BarChart data={h.col.topValues.slice(0, 6)} total={h.table.rowCount} />
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="section">
    <h3>Tables <span class="muted">— sorted by richness · click a column to dive in</span></h3>
    <div class="tbl-grid">
      {#each tables as { t, topCols }}
        <div class="tbl-card">
          <button class="tbl-head" on:click={() => goTable(t.name)} title="Open {t.name}">
            <span class="tbl-name mono">{t.name}</span>
            <span class="tbl-meta mono">{formatNumber(t.rowCount)} rows · {t.columns.length} cols</span>
          </button>
          {#if topCols.length}
            <div class="chips">
              {#each topCols as c}
                <button class="cchip" on:click={() => goCol(t.name, c.name)} title="{c.name} ({c.kind})">
                  <span class="dot" style="background: {kindColor[c.kind]}"></span>
                  <span class="cname mono">{c.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <RelationshipMap {profile} on:navigate={(e) => goTable(e.detail)} />
</div>

<style>
  .overview { display: flex; flex-direction: column; gap: 28px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
  .stat { background: var(--bg-elev2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 2px; }
  .num { font-size: 26px; font-weight: 700; font-family: var(--mono); }
  .lbl { font-size: 12px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; }

  .section { display: flex; flex-direction: column; gap: 12px; }
  h3 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }

  .hl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .hl-card {
    text-align: left; background: var(--bg-elev2); border: 1px solid var(--border-soft);
    border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 6px; cursor: pointer;
  }
  .hl-card:hover { border-color: var(--accent); background: var(--bg-elev); }
  .hl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hl-col { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hl-kind { font-family: var(--mono); font-size: 11px; font-weight: 600; }
  .hl-table { font-size: 11px; color: var(--text-faint); }
  .hl-chart { margin-top: 4px; min-height: 40px; }

  .tbl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .tbl-card { background: var(--bg-elev2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .tbl-head { text-align: left; background: none; border: none; padding: 0; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
  .tbl-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .tbl-head:hover .tbl-name { color: var(--accent); }
  .tbl-meta { font-size: 11px; color: var(--text-faint); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .cchip {
    display: inline-flex; align-items: center; gap: 5px; background: var(--bg);
    border: 1px solid var(--border-soft); border-radius: 6px; padding: 3px 8px; cursor: pointer;
  }
  .cchip:hover { border-color: var(--accent); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .cname { font-size: 11px; color: var(--text-dim); }
  .cchip:hover .cname { color: var(--text); }
</style>
