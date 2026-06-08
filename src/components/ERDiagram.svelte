<script lang="ts">
  import { getContext } from 'svelte';
  import type { DatabaseProfile, NavigateFn } from '../lib/types';
  import { formatCompact } from '../lib/format';

  export let profile: DatabaseProfile;

  const navigate = getContext<NavigateFn>('navigate');

  interface Node { name: string; x: number; y: number; vx: number; vy: number; w: number; h: number; rows: number; self: boolean }
  interface Edge { from: string; to: string; label: string }

  let nodes: Node[] = [];
  let edges: Edge[] = [];
  let vb = { x: 0, y: 0, w: 800, h: 400 };

  $: build(profile);

  function build(p: DatabaseProfile) {
    const names = p.tables.map((t) => t.name);
    if (!names.length) { nodes = []; edges = []; return; }

    // Collapse parallel FK edges into one labelled edge.
    const edgeMap = new Map<string, Edge>();
    const selfRefs = new Set<string>();
    for (const r of p.relationships) {
      if (r.from === r.to) { selfRefs.add(r.from); continue; }
      const key = `${r.from}→${r.to}`;
      const e = edgeMap.get(key);
      if (e) e.label += `, ${r.columns}`;
      else edgeMap.set(key, { from: r.from, to: r.to, label: r.columns });
    }
    edges = [...edgeMap.values()];

    // Seed positions deterministically on a circle (no RNG → stable layout).
    const N = names.length;
    const R = 160 + N * 14;
    const ns: Node[] = p.tables.map((t, i) => {
      const a = (i / N) * Math.PI * 2;
      const w = Math.max(96, t.name.length * 8 + 28);
      return { name: t.name, x: Math.cos(a) * R, y: Math.sin(a) * R, vx: 0, vy: 0, w, h: 40, rows: t.rowCount, self: selfRefs.has(t.name) };
    });
    simulate(ns, edges);

    // Fit to a viewBox with padding.
    const pad = 40;
    const xs = ns.flatMap((n) => [n.x - n.w / 2, n.x + n.w / 2]);
    const ys = ns.flatMap((n) => [n.y - n.h / 2, n.y + n.h / 2]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    vb = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    nodes = ns;
  }

  // Compact Fruchterman–Reingold-style layout.
  function simulate(ns: Node[], es: Edge[]) {
    const byName = new Map(ns.map((n) => [n.name, n]));
    const ideal = 220; // ideal edge length
    for (let iter = 0; iter < 320; iter++) {
      const temp = 1 - iter / 320;
      // repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 1;
          const f = (ideal * ideal) / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      // attraction along edges
      for (const e of es) {
        const a = byName.get(e.from), b = byName.get(e.to);
        if (!a || !b) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d * d) / ideal;
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f;
        b.vx += dx * f; b.vy += dy * f;
      }
      // integrate with cooling + mild centering
      for (const n of ns) {
        n.x += Math.max(-30, Math.min(30, n.vx)) * temp * 0.08 - n.x * 0.002;
        n.y += Math.max(-30, Math.min(30, n.vy)) * temp * 0.08 - n.y * 0.002;
        n.vx = 0; n.vy = 0;
      }
    }
  }

  /** Trim the edge endpoint to the target node's border so the arrow sits outside it. */
  function endpoint(from: Node, to: Node) {
    let dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    const hw = to.w / 2 + 6, hh = to.h / 2 + 6;
    const t = Math.min(Math.abs(hw / (dx || 1e-6)), Math.abs(hh / (dy || 1e-6)));
    return { x: to.x - dx * t, y: to.y - dy * t };
  }

  function nodeByName(n: string) { return nodes.find((x) => x.name === n); }
</script>

{#if nodes.length}
  <div class="er">
    <h3>Schema map <span class="muted">— click a table to open it</span></h3>
    <div class="canvas">
      <svg viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)" />
          </marker>
        </defs>

        {#each edges as e}
          {@const a = nodeByName(e.from)}
          {@const b = nodeByName(e.to)}
          {#if a && b}
            {@const p = endpoint(a, b)}
            <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} class="edge" marker-end="url(#arrow)" />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} class="edge-label" text-anchor="middle">{e.label}</text>
          {/if}
        {/each}

        {#each nodes as n}
          <g
            class="node"
            role="button"
            tabindex="0"
            on:click={() => navigate({ view: 'table', table: n.name })}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate({ view: 'table', table: n.name })}
          >
            <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx="8" />
            <text x={n.x} y={n.y - 3} text-anchor="middle" class="t-name">{n.name}{#if n.self} ⟲{/if}</text>
            <text x={n.x} y={n.y + 12} text-anchor="middle" class="t-rows">{formatCompact(n.rows)} rows</text>
          </g>
        {/each}
      </svg>
    </div>
  </div>
{/if}

<style>
  .er { display: flex; flex-direction: column; gap: 12px; }
  h3 { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .canvas {
    background: var(--bg-elev2); border: 1px solid var(--border-soft);
    border-radius: var(--radius); padding: 8px;
  }
  svg { width: 100%; height: 420px; display: block; }
  .edge { stroke: var(--text-faint); stroke-width: 1.5; opacity: 0.7; }
  .edge-label { fill: var(--text-faint); font-family: var(--mono); font-size: 10px; }
  .node { cursor: pointer; }
  .node rect { fill: var(--bg-elev); stroke: var(--border); stroke-width: 1.5; transition: stroke 0.12s, fill 0.12s; }
  .node:hover rect { stroke: var(--accent); fill: var(--accent-soft); }
  .t-name { fill: var(--text); font-family: var(--mono); font-size: 13px; font-weight: 600; }
  .t-rows { fill: var(--text-faint); font-family: var(--mono); font-size: 10px; }
</style>
