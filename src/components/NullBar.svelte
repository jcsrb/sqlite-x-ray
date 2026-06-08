<script lang="ts">
  import { percent } from '../lib/format';
  export let nullFraction = 0;
</script>

<div class="wrap" title="{percent(nullFraction)} null">
  <div class="bar">
    <div class="filled" style="width: {(1 - nullFraction) * 100}%"></div>
  </div>
  <span class="lbl" class:warn={nullFraction > 0.5}>{percent(nullFraction)} null</span>
</div>

<style>
  .wrap { display: flex; align-items: center; gap: 6px; }
  .bar { flex: 1; height: 5px; background: var(--red); border-radius: 3px; overflow: hidden; opacity: 0.7; }
  .filled { height: 100%; background: var(--green); }
  .lbl { font-family: var(--mono); font-size: 10px; color: var(--text-faint); white-space: nowrap; }
  .lbl.warn { color: var(--amber); }
</style>
