<script lang="ts">
  import { getContext } from 'svelte';
  import type { Finding, NavigateFn } from '../lib/types';

  export let findings: Finding[] = [];
  const navigate = getContext<NavigateFn>('navigate');

  const icon: Record<string, string> = {
    'orphan-fk': '🔗', empty: '∅', constant: '▬', 'high-null': '◔', 'mixed-type': '⚠',
  };

  function open(f: Finding) {
    if (f.column) navigate({ view: 'column', table: f.table, column: f.column });
    else navigate({ view: 'table', table: f.table });
  }

  $: counts = {
    high: findings.filter((f) => f.severity === 'high').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
</script>

{#if findings.length}
  <div class="section">
    <h3>
      🩺 Data quality
      <span class="muted">—
        {#if counts.high}<span class="c high">{counts.high} high</span>{/if}
        {#if counts.warn}<span class="c warn">{counts.warn} warnings</span>{/if}
        {#if counts.info}<span class="c info">{counts.info} notes</span>{/if}
      </span>
    </h3>
    <div class="list">
      {#each findings as f}
        <button class="finding {f.severity}" on:click={() => open(f)} title="Go to {f.column ? `${f.table}.${f.column}` : f.table}">
          <span class="ico">{icon[f.kind]}</span>
          <span class="msg">{f.message}</span>
          {#if f.detail}<span class="detail">{f.detail}</span>{/if}
          <span class="kind mono">{f.kind}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .section { display: flex; flex-direction: column; gap: 12px; }
  h3 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .c { margin-left: 6px; }
  .c.high { color: var(--red); }
  .c.warn { color: var(--amber); }
  .c.info { color: var(--text-faint); }

  .list { display: flex; flex-direction: column; gap: 5px; }
  .finding {
    display: flex; align-items: center; gap: 10px; text-align: left; width: 100%;
    background: var(--bg-elev2); border: 1px solid var(--border-soft);
    border-left-width: 3px; border-radius: 8px; padding: 8px 12px; cursor: pointer;
  }
  .finding:hover { background: var(--bg-elev); border-color: var(--border); }
  .finding.high { border-left-color: var(--red); }
  .finding.warn { border-left-color: var(--amber); }
  .finding.info { border-left-color: var(--text-faint); }
  .ico { width: 16px; text-align: center; flex-shrink: 0; }
  .msg { font-size: 13px; color: var(--text); }
  .detail { font-size: 12px; color: var(--text-faint); }
  .kind { margin-left: auto; font-size: 10px; color: var(--text-faint); background: var(--bg); padding: 2px 7px; border-radius: 10px; flex-shrink: 0; }
</style>
