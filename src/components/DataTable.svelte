<script lang="ts">
  import { getContext, createEventDispatcher } from 'svelte';
  import { formatCell, truncate, isUrl } from '../lib/format';
  import type { InspectFn } from '../lib/types';

  export let columns: string[] = [];
  export let rows: Record<string, unknown>[] = [];
  export let maxColWidth = 240;
  /** label prefix for the inspector title, e.g. table name */
  export let label = 'Row';
  /** 1-based index of the first row (for paginated displays) */
  export let startIndex = 1;
  export let sortable = false;
  export let sortCol = '';
  export let sortDir: 'asc' | 'desc' = 'asc';

  const inspect = getContext<InspectFn>('inspect');
  const dispatch = createEventDispatcher<{ sort: string }>();
</script>

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th class="idx">#</th>
        {#each columns as c}
          {#if sortable}
            <th class="sortable" title="Sort by {c}" on:click={() => dispatch('sort', c)}>
              {c}{#if sortCol === c}<span class="sort">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>{/if}
            </th>
          {:else}
            <th title={c}>{c}</th>
          {/if}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i}
        <tr
          class="data-row"
          on:click={() => inspect?.({ title: `${label} #${startIndex + i}`, rows: [row] })}
          title="Click to inspect full row"
        >
          <td class="idx">{startIndex + i}</td>
          {#each columns as c}
            {@const v = row[c]}
            <td class:null={v === null || v === undefined} style="max-width: {maxColWidth}px">
              {#if isUrl(v)}
                <a href={v} target="_blank" rel="noopener noreferrer" title={formatCell(v)} on:click|stopPropagation>{truncate(formatCell(v), 80)}</a>
              {:else}
                <span title={formatCell(v)}>{truncate(formatCell(v), 80)}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
      {#if rows.length === 0}
        <tr><td class="empty" colspan={columns.length + 1}>no rows</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .scroll { overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); max-height: 480px; }
  table { border-collapse: collapse; width: 100%; font-family: var(--mono); font-size: 12px; }
  thead th {
    position: sticky; top: 0; z-index: 1;
    background: var(--bg-elev2); color: var(--text-dim);
    text-align: left; font-weight: 600; padding: 7px 10px;
    border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  thead th.sortable { cursor: pointer; user-select: none; }
  thead th.sortable:hover { color: var(--text); }
  .sort { color: var(--accent); }
  td { padding: 6px 10px; border-bottom: 1px solid var(--border-soft); }
  td span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tbody tr.data-row { cursor: pointer; }
  tbody tr:hover { background: var(--bg-elev2); }
  td a { color: var(--accent); }
  .idx { color: var(--text-faint); text-align: right; width: 1%; user-select: none; }
  .null { color: var(--text-faint); font-style: italic; }
  .empty { text-align: center; color: var(--text-faint); padding: 20px; font-style: italic; }
</style>
