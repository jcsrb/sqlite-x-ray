<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DatabaseProfile } from '../lib/types';
  export let profile: DatabaseProfile;
  const dispatch = createEventDispatcher<{ navigate: string }>();
</script>

{#if profile.relationships.length}
  <div class="rel">
    <h3>Relationships <span class="muted">({profile.relationships.length})</span></h3>
    <div class="edges">
      {#each profile.relationships as r}
        <div class="edge">
          <button class="node" on:click={() => dispatch('navigate', r.from)}>{r.from}</button>
          <span class="arrow">→</span>
          <button class="node target" on:click={() => dispatch('navigate', r.to)}>{r.to}</button>
          <span class="cols mono">{r.columns}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .rel { display: flex; flex-direction: column; gap: 10px; }
  h3 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: var(--text-faint); }
  .edges { display: flex; flex-direction: column; gap: 6px; }
  .edge {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg-elev2); border: 1px solid var(--border-soft);
    border-radius: 8px; padding: 6px 12px; font-size: 13px;
  }
  .node { font-family: var(--mono); font-weight: 600; background: none; border: none; padding: 0; cursor: pointer; color: var(--text); font-size: 13px; }
  .node:hover { text-decoration: underline; }
  .target { color: var(--accent); }
  .arrow { color: var(--text-faint); }
  .cols { margin-left: auto; font-size: 11px; color: var(--text-faint); }
</style>
