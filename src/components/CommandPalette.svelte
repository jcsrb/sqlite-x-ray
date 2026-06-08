<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import type { DatabaseProfile, Nav } from '../lib/types';

  export let profile: DatabaseProfile;

  const dispatch = createEventDispatcher<{ select: Nav; close: void }>();

  type Item = { label: string; sub: string; nav: Nav; kind: string };

  $: items = buildItems(profile);
  function buildItems(p: DatabaseProfile): Item[] {
    const out: Item[] = [
      { label: 'Overview', sub: 'dashboard', nav: { view: 'overview' }, kind: '📊' },
      { label: 'SQL console', sub: 'run queries', nav: { view: 'sql' }, kind: '⌨️' },
    ];
    for (const t of [...p.tables, ...p.views]) {
      out.push({ label: t.name, sub: `${t.type} · ${t.columns.length} cols`, nav: { view: 'table', table: t.name }, kind: t.type === 'view' ? '◇' : '▦' });
      for (const c of t.columns) {
        out.push({ label: `${t.name}.${c.name}`, sub: `${c.kind} column`, nav: { view: 'column', table: t.name, column: c.name }, kind: '∷' });
      }
    }
    return out;
  }

  let q = '';
  let sel = 0;
  let input: HTMLInputElement;

  $: filtered = (() => {
    const needle = q.trim().toLowerCase();
    const list = !needle ? items : items.filter((i) => i.label.toLowerCase().includes(needle));
    return list.slice(0, 50);
  })();
  $: if (filtered && sel >= filtered.length) sel = 0;

  onMount(async () => {
    await tick();
    input?.focus();
  });

  function choose(i: number) {
    const item = filtered[i];
    if (item) dispatch('select', item.nav);
  }

  async function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { dispatch('close'); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(filtered.length - 1, sel + 1); scrollSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); scrollSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  }

  let listEl: HTMLDivElement;
  async function scrollSel() {
    await tick();
    listEl?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div class="backdrop" on:click={() => dispatch('close')} role="presentation">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="palette" on:click|stopPropagation role="dialog" aria-label="Search">
    <input
      bind:this={input}
      bind:value={q}
      on:keydown={onKey}
      placeholder="Jump to a table or column…"
      spellcheck="false"
    />
    <div class="list" bind:this={listEl}>
      {#each filtered as item, i}
        <button class="item" class:active={i === sel} on:click={() => choose(i)} on:mouseenter={() => (sel = i)}>
          <span class="ik">{item.kind}</span>
          <span class="il mono">{item.label}</span>
          <span class="is">{item.sub}</span>
        </button>
      {/each}
      {#if filtered.length === 0}
        <div class="empty">No matches</div>
      {/if}
    </div>
    <div class="hint">↑↓ navigate · ↵ open · esc close</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
    display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; z-index: 200;
  }
  .palette {
    width: min(560px, 92vw); background: var(--bg-elev); border: 1px solid var(--border);
    border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); overflow: hidden;
    display: flex; flex-direction: column; max-height: 70vh;
  }
  input {
    border: none; border-bottom: 1px solid var(--border); background: transparent; color: var(--text);
    padding: 16px 18px; font-size: 15px; outline: none; font-family: var(--sans);
  }
  .list { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 1px; }
  .item {
    display: flex; align-items: center; gap: 10px; text-align: left; width: 100%;
    background: none; border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer;
  }
  .item.active { background: var(--accent-soft); }
  .ik { width: 16px; text-align: center; color: var(--text-faint); flex-shrink: 0; }
  .il { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .is { margin-left: auto; font-size: 11px; color: var(--text-faint); flex-shrink: 0; }
  .empty { padding: 24px; text-align: center; color: var(--text-faint); font-style: italic; }
  .hint { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-faint); font-family: var(--mono); }
</style>
