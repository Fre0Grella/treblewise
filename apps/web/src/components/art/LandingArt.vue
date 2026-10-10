<!--
  The pictures on the landing page's cards (issue #23), one per point, so the
  cards show what each one means rather than being text in a box.

  In the same hand as the lobby's (LobbyArt): lines in the text colour, red for
  what points at the board, green for what comes from it. The scoreboard and
  the statistics are the lobby's own drawings; the caller and the device are
  drawn here. Decoration only: the card's words carry the meaning, and the
  landing page hides every picture from screen readers.
-->
<script setup lang="ts">
import ArtLaptop from './ArtLaptop.vue';
import ArtPhone from './ArtPhone.vue';
import LobbyArt from './LobbyArt.vue';

export type LandingArtKind = 'score' | 'caller' | 'stats' | 'device';

defineProps<{ kind: LandingArtKind }>();

const LINE = { fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

/** An arc of radius r around (cx, cy), from -spread to +spread degrees off pointing right. */
function arc(cx: number, cy: number, r: number, spread: number): string {
  const a = (spread * Math.PI) / 180;
  const x = cx + r * Math.cos(a);
  const dy = r * Math.sin(a);
  return `M${x} ${cy - dy} A${r} ${r} 0 0 1 ${x} ${cy + dy}`;
}

const WAVES = [36, 64, 92].map((r, i) => ({ d: arc(150, 150, r, 38), delay: `${i * 300}ms` }));
// The double 20, lit: where the call sends the last dart.
const D20 = (() => {
  const [cx, cy, ro, ri, half] = [312, 150, 62, 52, (9 * Math.PI) / 180];
  const p = (r: number, t: number) => `${cx + r * Math.sin(t)} ${cy - r * Math.cos(t)}`;
  return `M${p(ro, -half)} A${ro} ${ro} 0 0 1 ${p(ro, half)} L${p(ri, half)} A${ri} ${ri} 0 0 0 ${p(ri, -half)} Z`;
})();
</script>

<template>
  <LobbyArt v-if="kind === 'score'" kind="resume" />
  <LobbyArt v-else-if="kind === 'stats'" kind="stats" />

  <!-- The call, out loud, and the checkout on the board itself. -->
  <svg v-else-if="kind === 'caller'" class="lobby-art-svg" viewBox="0 0 400 300">
    <path v-bind="LINE" d="M54 126 h36 l48 -40 v128 l-48 -40 h-36 z" />
    <path
      v-for="wave in WAVES"
      :key="wave.d"
      v-bind="LINE"
      class="lobby-art-pulse"
      :style="{ animationDelay: wave.delay }"
      :d="wave.d"
      stroke="var(--green-300)"
    />
    <g :opacity="0.55">
      <circle v-bind="LINE" :cx="312" :cy="150" :r="62" />
      <circle v-bind="LINE" :cx="312" :cy="150" :r="34" :stroke-width="2" />
      <circle :cx="312" :cy="150" :r="6" fill="currentColor" />
    </g>
    <path :d="D20" fill="var(--board-red)" />
    <text :x="312" :y="252" text-anchor="middle" :font-size="22" font-weight="700" fill="var(--checkout)">D20</text>
  </svg>

  <!-- Two devices, and nothing going up to a cloud. -->
  <svg v-else class="lobby-art-svg" viewBox="0 0 400 300">
    <g :opacity="0.55">
      <path
        v-bind="LINE"
        stroke-dasharray="7 7"
        d="M168 104 a26 26 0 0 1 6 -50 a36 36 0 0 1 66 -10 a26 26 0 0 1 30 60 z"
      />
    </g>
    <line v-bind="LINE" :x1="176" :y1="30" :x2="262" :y2="116" stroke="var(--red-400)" :stroke-width="4" />
    <g transform="translate(150 212) scale(2.4)"><ArtLaptop :x="0" :y="0" /></g>
    <g transform="translate(318 206) scale(2.4)"><ArtPhone :x="0" :y="0" :rotate="-6" /></g>
  </svg>
</template>
