<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatCell, formatNumber, truncate } from '../lib/format';
  import type { TopValue } from '../lib/types';

  export let data: TopValue[] = [];
  export let total = 0; // total rows, for share calc; 0 hides share
  export let clickable = false;

  const dispatch = createEventDispatcher<{ select: unknown }>();
  $: max = data.reduce((m, d) => Math.max(m, d.count), 0) || 1;
</script>

<div class="bars">
  {#each data as d}
    {@const pct = (d.count / max) * 100}
    {#if clickable}
      <button class="row clickable" title="{formatCell(d.value)} — click to view rows" on:click={() => dispatch('select', d.value)}>
        <div class="label">{truncate(formatCell(d.value), 28)}</div>
        <div class="track"><div class="fill" style="width: {pct}%"></div></div>
        <div class="count">{formatNumber(d.count)}{#if total > 0}<span class="share"> · {((d.count / total) * 100).toFixed(0)}%</span>{/if}</div>
      </button>
    {:else}
      <div class="row" title={formatCell(d.value)}>
        <div class="label">{truncate(formatCell(d.value), 28)}</div>
        <div class="track"><div class="fill" style="width: {pct}%"></div></div>
        <div class="count">{formatNumber(d.count)}{#if total > 0}<span class="share"> · {((d.count / total) * 100).toFixed(0)}%</span>{/if}</div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .bars { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: grid; grid-template-columns: minmax(70px, 130px) 1fr auto;
    align-items: center; gap: 8px;
    width: 100%; text-align: inherit; background: none; border: none;
    padding: 1px 0; border-radius: 4px; color: inherit; font: inherit;
  }
  .row.clickable { cursor: pointer; }
  .row.clickable:hover { background: var(--bg); }
  .row.clickable:hover .label { color: var(--text); }
  .label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .track { background: var(--bg); border-radius: 4px; height: 16px; overflow: hidden; }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--purple));
    border-radius: 4px;
    min-width: 2px;
    transition: width 0.3s ease;
  }
  .count { font-family: var(--mono); font-size: 11px; color: var(--text); white-space: nowrap; }
  .share { color: var(--text-faint); }
</style>
