<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatNumber } from '../lib/format';
  import type { HistogramBin } from '../lib/types';

  export let bins: HistogramBin[] = [];
  export let clickable = false;

  const dispatch = createEventDispatcher<{ select: HistogramBin }>();
  $: max = bins.reduce((m, b) => Math.max(m, b.count), 0) || 1;
</script>

<div class="hist">
  <div class="cols" class:clickable>
    {#each bins as b}
      {@const h = (b.count / max) * 100}
      {#if clickable}
        <button class="col" title="{b.label}: {formatNumber(b.count)} — click to view rows" on:click={() => dispatch('select', b)}>
          <div class="bar" style="height: {Math.max(h, b.count > 0 ? 2 : 0)}%"></div>
        </button>
      {:else}
        <div class="col" title="{b.label}: {formatNumber(b.count)}">
          <div class="bar" style="height: {Math.max(h, b.count > 0 ? 2 : 0)}%"></div>
        </div>
      {/if}
    {/each}
  </div>
  {#if bins.length}
    {@const firstParts = bins[0].label.split(' – ')}
    {@const lastParts = bins[bins.length - 1].label.split(' – ')}
    <div class="axis">
      <span>{firstParts[0]}</span>
      <span>{lastParts[1] ?? lastParts[0]}</span>
    </div>
  {/if}
</div>

<style>
  .hist { display: flex; flex-direction: column; gap: 4px; }
  .cols { display: flex; align-items: flex-end; gap: 2px; height: 90px; }
  .col { flex: 1; height: 100%; display: flex; align-items: flex-end; background: none; border: none; padding: 0; }
  .cols.clickable .col { cursor: pointer; }
  .bar {
    width: 100%;
    background: linear-gradient(180deg, var(--accent), #1f6feb);
    border-radius: 2px 2px 0 0;
    transition: height 0.3s ease;
  }
  .col:hover .bar { background: var(--purple); }
  .axis {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-faint);
  }
</style>
