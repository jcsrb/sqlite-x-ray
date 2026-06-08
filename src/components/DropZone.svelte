<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { ProgressEvent } from '../lib/types';

  export let loading = false;
  export let error = '';
  export let progress: ProgressEvent | null = null;

  const dispatch = createEventDispatcher<{ file: File }>();
  let dragging = false;
  let input: HTMLInputElement;

  function handleFiles(files: FileList | null) {
    if (files && files.length) dispatch('file', files[0]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer?.files ?? null);
  }
</script>

<div
  class="drop"
  class:dragging
  class:loading
  role="button"
  tabindex="0"
  on:click={() => input.click()}
  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && input.click()}
  on:dragover|preventDefault={() => (dragging = true)}
  on:dragleave={() => (dragging = false)}
  on:drop={onDrop}
>
  <input
    bind:this={input}
    type="file"
    accept=".sqlite,.sqlite3,.db,.db3,.gz,.sqlite.gz,.db.gz,application/x-sqlite3,application/vnd.sqlite3,application/gzip"
    on:change={(e) => handleFiles(e.currentTarget.files)}
    hidden
  />

  {#if loading}
    <div class="spinner"></div>
    <p class="big">X-raying database…</p>
    {#if progress && progress.total > 0}
      <p class="sub">Profiling {progress.label} ({progress.done}/{progress.total})</p>
      <div class="progress"><div class="pfill" style="width: {(progress.done / progress.total) * 100}%"></div></div>
    {:else}
      <p class="sub">Reading file &amp; loading engine…</p>
    {/if}
  {:else}
    <div class="icon">🗄️</div>
    <p class="big">Drop a SQLite database</p>
    <p class="sub">or click to browse · <code>.sqlite</code> <code>.db</code> <code>.sqlite3</code> <code>.gz</code></p>
    <p class="privacy">🔒 100% in-browser — your file never leaves this device</p>
  {/if}

  {#if error}<div class="error mono">{error}</div>{/if}
</div>

<style>
  .drop {
    border: 2px dashed var(--border);
    border-radius: 16px;
    padding: 60px 40px;
    text-align: center;
    transition: all 0.15s ease;
    background: var(--bg-elev);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .drop:hover { border-color: var(--accent); background: var(--bg-elev2); }
  .drop.dragging { border-color: var(--accent); background: var(--accent-soft); transform: scale(1.01); }
  .drop.loading { cursor: default; }
  .icon { font-size: 48px; margin-bottom: 8px; }
  .big { font-size: 18px; font-weight: 600; margin: 0; }
  .sub { color: var(--text-dim); margin: 0; font-size: 13px; }
  .sub code { font-size: 11px; background: var(--bg); padding: 1px 5px; border-radius: 4px; }
  .privacy { color: var(--text-faint); font-size: 12px; margin-top: 12px; }
  .error { color: var(--red); margin-top: 16px; background: #f8514922; padding: 10px 14px; border-radius: 8px; font-size: 12px; }
  .spinner {
    width: 40px; height: 40px; border: 3px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.8s linear infinite; margin-bottom: 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress { width: 220px; height: 6px; background: var(--bg); border-radius: 4px; overflow: hidden; margin-top: 10px; }
  .pfill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--purple)); transition: width 0.2s ease; }
</style>
