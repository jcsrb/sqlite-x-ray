<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { DbClient } from '../lib/client';
  import type { ForeignKey } from '../lib/types';
  import { formatCell, isUrl, formatNumber } from '../lib/format';
  import { buildCount, buildSelect, drillable } from '../lib/sql';

  export let title = '';
  export let rows: Record<string, unknown>[] = [];
  export let total: number | undefined = undefined;
  export let table: string | undefined = undefined;
  export let sql: string | undefined = undefined;
  export let fks: ForeignKey[] = [];
  export let client: DbClient;

  const dispatch = createEventDispatcher<{
    close: void;
    query: string;
    follow: { refTable: string; match: { col: string; value: unknown }[] };
  }>();
  const close = () => dispatch('close');

  $: fkByCol = new Map(fks.map((fk) => [fk.from, fk]));

  // A composite key is followed with all of its columns; if any is NULL the
  // key doesn't reference anything.
  function followMatch(fk: ForeignKey, row: Record<string, unknown>) {
    const match = fk.pairs.map((p) => ({ col: p.to, value: row[p.from] }));
    return match.some((m) => m.value === null || m.value === undefined) ? null : match;
  }

  $: columns = rows.length ? Object.keys(rows[0]) : [];

  // Frequency counts (how many rows share a value), loaded lazily on hover.
  let counts: Record<string, number> = {};
  let loading: Record<string, boolean> = {};
  $: { void rows; counts = {}; loading = {}; }

  // Keyed by table too: following an FK swaps the table under the same modal.
  const key = (col: string, v: unknown) => JSON.stringify([table, col, v === null || v === undefined ? null : String(v), v == null]);

  async function loadCount(col: string, v: unknown) {
    if (!table || !drillable(v)) return;
    const k = key(col, v);
    if (k in counts || loading[k]) return;
    loading = { ...loading, [k]: true };
    try {
      const n = await client.scalar<number>(buildCount(table, col, v));
      counts = { ...counts, [k]: Number(n) || 0 };
    } catch {
      /* database closed or query failed — just leave the count unknown */
    } finally {
      loading = { ...loading, [k]: false };
    }
  }

  function drill(col: string, v: unknown) {
    if (table) dispatch('query', buildSelect(table, col, v));
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="backdrop" on:click={close} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1" aria-label={title}>
    <div class="head">
      <div class="title">
        <span class="mono">{title}</span>
        <span class="count">
          {#if total !== undefined && total > rows.length}
            showing {rows.length} of {formatNumber(total)}
          {:else}
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          {/if}
          {#if table}· hover a field for its frequency, click to query{/if}
        </span>
      </div>
      <button class="x" on:click={close} title="Close (Esc)">✕</button>
    </div>

    {#if sql}
      <button class="open-sql" on:click={() => dispatch('query', sql ?? '')} title="Open this query in the SQL console">
        <span class="mono">{sql.replace(/\s+/g, ' ').slice(0, 90)}</span>
        <span class="go">open in console →</span>
      </button>
    {/if}

    <div class="body">
      {#each rows as row, i}
        <div class="row-card">
          {#if rows.length > 1}<div class="row-num mono">#{i + 1}</div>{/if}
          <div class="fields">
            {#each columns as c}
              {@const v = row[c]}
              {@const k = key(c, v)}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
              <div class="field" on:mouseenter={() => loadCount(c, v)}>
                <span class="k mono">{c}</span>
                <span class="v" class:null={v === null || v === undefined}>
                  {#if isUrl(v)}
                    <a href={v} target="_blank" rel="noopener noreferrer">{formatCell(v)}</a>
                  {:else if table && drillable(v)}
                    <button class="vbtn mono" on:click={() => drill(c, v)} title="query rows where {c} = this">{formatCell(v)}</button>
                  {:else}
                    <span class="mono">{formatCell(v)}</span>
                  {/if}
                </span>
                <span class="acts">
                  {#if fkByCol.has(c) && v !== null && v !== undefined}
                    {@const fk = fkByCol.get(c)}
                    {@const match = fk ? followMatch(fk, row) : null}
                    {#if fk && match}
                      <button
                        class="fk-follow"
                        on:click={() => dispatch('follow', { refTable: fk.table, match })}
                        title="open the {fk.table} row this references"
                      >→ {fk.table}</button>
                    {/if}
                  {/if}
                  {#if table && drillable(v)}
                    <button class="freq" on:click={() => drill(c, v)} title="rows where {c} = this — click to query">
                      {#if loading[k]}…{:else if k in counts}{formatNumber(counts[k])}×{:else}↗{/if}
                    </button>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
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

  .open-sql {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 10px 14px 0; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; cursor: pointer; text-align: left;
  }
  .open-sql:hover { border-color: var(--accent); }
  .open-sql .mono { font-size: 11px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-sql .go { font-size: 11px; color: var(--accent); flex-shrink: 0; }

  .body { overflow-y: auto; padding: 12px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .row-card { border: 1px solid var(--border-soft); border-radius: 10px; padding: 4px 12px; background: var(--bg-elev2); }
  .row-num { color: var(--text-faint); font-size: 11px; padding: 8px 0 2px; }
  .fields { display: flex; flex-direction: column; }
  .field {
    display: grid; grid-template-columns: minmax(110px, 190px) 1fr auto; gap: 10px; align-items: center;
    padding: 6px 6px; border-bottom: 1px solid var(--border-soft); border-radius: 6px;
  }
  .field:last-child { border-bottom: none; }
  .field:hover { background: var(--bg); }
  .k { color: var(--text-dim); font-size: 12px; }
  .v { font-size: 12px; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
  .v.null { color: var(--text-faint); font-style: italic; }
  .v .mono { white-space: pre-wrap; }
  .vbtn { background: none; border: none; padding: 0; color: var(--text); cursor: pointer; text-align: left; font-size: 12px; }
  .vbtn:hover { color: var(--accent); text-decoration: underline; }
  .acts { display: flex; align-items: center; gap: 6px; }
  .freq {
    font-family: var(--mono); font-size: 11px; color: var(--text-faint);
    background: var(--bg); border: 1px solid var(--border-soft); border-radius: 6px;
    padding: 2px 8px; cursor: pointer; opacity: 0; transition: opacity 0.1s;
  }
  .field:hover .freq { opacity: 1; }
  .freq:hover { color: var(--accent); border-color: var(--accent); }
  .fk-follow {
    font-family: var(--mono); font-size: 11px; color: var(--purple);
    background: #bc8cff1a; border: 1px solid #bc8cff55; border-radius: 6px;
    padding: 2px 8px; cursor: pointer; white-space: nowrap;
  }
  .fk-follow:hover { background: #bc8cff33; }
  .empty { color: var(--text-faint); text-align: center; padding: 24px; font-style: italic; }
</style>
