<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatCell, isUrl, formatNumber } from '../lib/format';

  export let title = '';
  export let rows: Record<string, unknown>[] = [];
  export let total: number | undefined = undefined;

  const dispatch = createEventDispatcher<{ close: void }>();
  const close = () => dispatch('close');

  $: columns = rows.length ? Object.keys(rows[0]) : [];

  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div class="backdrop" on:click={close} role="presentation">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="modal" on:click|stopPropagation role="dialog" aria-label={title}>
    <div class="head">
      <div class="title">
        <span class="mono">{title}</span>
        <span class="count">
          {#if total !== undefined && total > rows.length}
            showing {rows.length} of {formatNumber(total)}
          {:else}
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          {/if}
        </span>
      </div>
      <button class="x" on:click={close} title="Close (Esc)">✕</button>
    </div>

    <div class="body">
      {#each rows as row, i}
        <div class="row-card">
          {#if rows.length > 1}<div class="row-num mono">#{i + 1}</div>{/if}
          <dl>
            {#each columns as c}
              {@const v = row[c]}
              <dt class="mono">{c}</dt>
              <dd class:null={v === null || v === undefined}>
                {#if isUrl(v)}
                  <a href={v} target="_blank" rel="noopener noreferrer">{formatCell(v)}</a>
                {:else}
                  <span class="mono">{formatCell(v)}</span>
                {/if}
              </dd>
            {/each}
          </dl>
        </div>
      {/each}
      {#if rows.length === 0}
        <div class="empty">No matching rows.</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px; backdrop-filter: blur(2px);
  }
  .modal {
    background: var(--bg-elev); border: 1px solid var(--border);
    border-radius: 14px; width: min(720px, 100%); max-height: 84vh;
    display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 18px; border-bottom: 1px solid var(--border);
  }
  .title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title .mono { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 11px; color: var(--text-faint); }
  .x { padding: 4px 9px; font-size: 12px; }

  .body { overflow-y: auto; padding: 8px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .row-card { border: 1px solid var(--border-soft); border-radius: 10px; padding: 4px 14px; background: var(--bg-elev2); }
  .row-num { color: var(--text-faint); font-size: 11px; padding: 8px 0 2px; }
  dl { display: grid; grid-template-columns: minmax(110px, 200px) 1fr; gap: 0; margin: 0; }
  dt { color: var(--text-dim); font-size: 12px; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--border-soft); }
  dd {
    margin: 0; padding: 8px 0; border-bottom: 1px solid var(--border-soft);
    font-size: 12px; word-break: break-word; overflow-wrap: anywhere;
  }
  dl > dt:last-of-type, dl > dd:last-of-type { border-bottom: none; }
  dd.null { color: var(--text-faint); font-style: italic; }
  dd .mono { white-space: pre-wrap; }
  .empty { color: var(--text-faint); text-align: center; padding: 24px; font-style: italic; }
</style>
