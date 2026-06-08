<script lang="ts">
  import type { DbClient } from '../lib/client';
  import DataTable from './DataTable.svelte';

  export let client: DbClient;

  let sql = 'SELECT name FROM sqlite_master WHERE type = \'table\';';
  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let error = '';
  let elapsed = 0;
  let ran = false;
  let running = false;

  async function run() {
    error = '';
    ran = true;
    running = true;
    const t0 = performance.now();
    try {
      rows = await client.query(sql);
      columns = rows.length ? Object.keys(rows[0]) : [];
      elapsed = performance.now() - t0;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      rows = [];
      columns = [];
    } finally {
      running = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }
</script>

<div class="console">
  <div class="editor">
    <textarea bind:value={sql} on:keydown={onKey} spellcheck="false" rows="4"></textarea>
    <div class="bar">
      <span class="hint">⌘/Ctrl + Enter to run</span>
      <button class="primary" on:click={run} disabled={running}>{running ? 'Running…' : 'Run query'}</button>
    </div>
  </div>

  {#if error}
    <div class="error mono">{error}</div>
  {:else if ran}
    <div class="result-meta">{rows.length} rows · {elapsed.toFixed(1)} ms</div>
    <DataTable {columns} {rows} />
  {/if}
</div>

<style>
  .console { display: flex; flex-direction: column; gap: 12px; }
  .editor {
    background: var(--bg-elev2); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  textarea {
    width: 100%; border: none; background: var(--bg); color: var(--text);
    font-family: var(--mono); font-size: 13px; padding: 14px; resize: vertical;
    outline: none; line-height: 1.6; display: block;
  }
  .bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
  .hint { color: var(--text-faint); font-size: 11px; font-family: var(--mono); }
  .error {
    background: #f8514922; border: 1px solid #f8514955; color: var(--red);
    border-radius: var(--radius); padding: 12px 14px; font-size: 12px; white-space: pre-wrap;
  }
  .result-meta { color: var(--text-faint); font-size: 12px; font-family: var(--mono); }
</style>
