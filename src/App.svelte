<script lang="ts">
  import { setContext, onMount } from 'svelte';
  import { readDatabaseFile } from './lib/db';
  import { DbClient } from './lib/client';
  import type { DatabaseProfile, InspectFn, Nav, NavigateFn, ColumnProfile, ProgressEvent } from './lib/types';
  import { formatNumber } from './lib/format';

  import DropZone from './components/DropZone.svelte';
  import Overview from './components/Overview.svelte';
  import TableDetail from './components/TableDetail.svelte';
  import ColumnView from './components/ColumnView.svelte';
  import SqlConsole from './components/SqlConsole.svelte';
  import RowModal from './components/RowModal.svelte';
  import CommandPalette from './components/CommandPalette.svelte';

  // Row-inspector overlay, provided to descendants via context.
  let inspectData: { title: string; rows: Record<string, unknown>[]; total?: number } | null = null;
  const inspect: InspectFn = (data) => (inspectData = data);
  setContext<InspectFn>('inspect', inspect);

  // Navigation, also provided via context so any descendant can deep-link.
  let nav: Nav = { view: 'overview' };
  const navigate: NavigateFn = (n) => {
    nav = n;
    inspectData = null;
  };
  setContext<NavigateFn>('navigate', navigate);

  let client: DbClient | null = null;
  let profile: DatabaseProfile | null = null;
  let loading = false;
  let error = '';
  let progress: ProgressEvent | null = null;
  let paletteOpen = false;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (profile) paletteOpen = !paletteOpen;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function loadFile(file: File) {
    loading = true;
    error = '';
    progress = null;
    try {
      const buf = await readDatabaseFile(file);
      const c = new DbClient();
      profile = await c.open(buf, file.name, file.size, (p) => (progress = p));
      client?.close();
      client = c;
      nav = { view: 'overview' };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(e);
    } finally {
      loading = false;
      progress = null;
    }
  }

  function reset() {
    client?.close();
    client = null;
    profile = null;
    error = '';
    nav = { view: 'overview' };
  }

  $: activeTable = nav.view === 'table' || nav.view === 'column' ? nav.table : null;
  $: currentTable =
    profile && activeTable
      ? [...profile.tables, ...profile.views].find((t) => t.name === activeTable) ?? null
      : null;
  let currentColumn: ColumnProfile | null = null;
  $: {
    if (currentTable && nav.view === 'column') {
      const name = nav.column;
      currentColumn = currentTable.columns.find((c) => c.name === name) ?? null;
    } else {
      currentColumn = null;
    }
  }
</script>

{#if !profile}
  <div class="landing">
    <header class="hero">
      <h1>SQLite <span class="x">X-Ray</span></h1>
      <p>Drop in a database and get an instant, automatic breakdown — schema, profiles, distributions &amp; charts. Nothing is uploaded.</p>
    </header>
    <DropZone {loading} {error} {progress} on:file={(e) => loadFile(e.detail)} />
  </div>
{:else}
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <h1>SQLite <span class="x">X-Ray</span></h1>
        <button class="close" title="Close database" on:click={reset}>✕</button>
      </div>
      <div class="file mono" title={profile.fileName}>{profile.fileName}</div>

      <button class="search" on:click={() => (paletteOpen = true)}>
        <span>🔍 Search</span>
        <kbd>⌘K</kbd>
      </button>

      <nav>
        <button class="nav" class:active={nav.view === 'overview'} on:click={() => navigate({ view: 'overview' })}>
          <span>📊 Overview</span>
        </button>
        <button class="nav" class:active={nav.view === 'sql'} on:click={() => navigate({ view: 'sql' })}>
          <span>⌨️ SQL console</span>
        </button>

        <div class="group-label">Tables ({profile.tables.length})</div>
        {#each profile.tables as t}
          <button class="nav table" class:active={activeTable === t.name} on:click={() => navigate({ view: 'table', table: t.name })}>
            <span class="tname">{t.name}</span>
            <span class="trows mono">{formatNumber(t.rowCount)}</span>
          </button>
        {/each}

        {#if profile.views.length}
          <div class="group-label">Views ({profile.views.length})</div>
          {#each profile.views as v}
            <button class="nav table" class:active={activeTable === v.name} on:click={() => navigate({ view: 'table', table: v.name })}>
              <span class="tname">{v.name}</span>
            </button>
          {/each}
        {/if}
      </nav>
    </aside>

    <main class="content">
      {#if nav.view === 'overview'}
        <Overview {profile} />
      {:else if nav.view === 'sql' && client}
        <SqlConsole {client} />
      {:else if nav.view === 'column' && currentTable && currentColumn && client}
        <ColumnView {client} table={currentTable} col={currentColumn} />
      {:else if currentTable && client}
        <TableDetail table={currentTable} {client} />
      {/if}
    </main>
  </div>
{/if}

{#if inspectData}
  <RowModal
    title={inspectData.title}
    rows={inspectData.rows}
    total={inspectData.total}
    on:close={() => (inspectData = null)}
  />
{/if}

{#if paletteOpen && profile}
  <CommandPalette
    {profile}
    on:select={(e) => { navigate(e.detail); paletteOpen = false; }}
    on:close={() => (paletteOpen = false)}
  />
{/if}

<style>
  .landing {
    max-width: 680px; margin: 0 auto; padding: 12vh 24px 24px;
    display: flex; flex-direction: column; gap: 28px;
  }
  .hero { text-align: center; }
  .hero h1 { font-size: 40px; letter-spacing: -0.02em; }
  .hero p { color: var(--text-dim); font-size: 15px; max-width: 480px; margin: 12px auto 0; }
  .x { color: var(--accent); }

  .app { display: grid; grid-template-columns: 270px 1fr; min-height: 100vh; }
  .sidebar {
    border-right: 1px solid var(--border); background: var(--bg-elev);
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .brand { display: flex; align-items: center; justify-content: space-between; }
  .brand h1 { font-size: 18px; }
  .close { padding: 4px 9px; font-size: 12px; }
  .file {
    font-size: 11px; color: var(--text-faint); padding: 6px 8px;
    background: var(--bg); border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .search {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    background: var(--bg-elev2); border: 1px solid var(--border); border-radius: 8px;
    padding: 7px 12px; color: var(--text-dim); width: 100%;
  }
  .search:hover { border-color: var(--accent); color: var(--text); }
  .search kbd { font-family: var(--mono); font-size: 10px; color: var(--text-faint); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }

  nav { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
  .group-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-faint); margin: 14px 0 4px; padding: 0 8px;
  }
  .nav {
    text-align: left; background: none; border: none; border-radius: 7px;
    padding: 7px 10px; color: var(--text-dim); display: flex;
    align-items: center; justify-content: space-between; gap: 8px; width: 100%;
  }
  .nav:hover { background: var(--bg-elev2); color: var(--text); }
  .nav.active { background: var(--accent-soft); color: var(--text); }
  .nav.table .tname {
    font-family: var(--mono); font-size: 12px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .trows { font-size: 10px; color: var(--text-faint); }

  .content { padding: 28px 32px; max-width: 1200px; width: 100%; }

  @media (max-width: 720px) {
    .app { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; }
  }
</style>
