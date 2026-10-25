<!--
  The app's icons: one stroke set, drawn inline so they take the text colour.
  An icon is decoration; the button around it carries the label (issue #20:
  icons instead of "✕" and "+" typed as text).
-->
<script setup lang="ts">
export type IconName =
  | 'back'
  | 'forward'
  | 'close'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'menu'
  | 'check'
  | 'chevron-down'
  | 'chevron-up'
  | 'speaker'
  | 'speaker-off'
  | 'board'
  | 'keypad'
  | 'drag'
  | 'pencil'
  | 'order'
  | 'bull'
  | 'wheel'
  | 'undo'
  | 'expand'
  | 'shrink';

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });

const PATHS: Record<IconName, string> = {
  back: 'M15 18l-6-6 6-6',
  forward: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  check: 'M5 12l5 5 9-10',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  speaker: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  'speaker-off': 'M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6',
  board: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  keypad: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  pencil: 'M4 20l4-1 11-11-3-3L5 16l-1 4z',
  order: 'M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4',
  bull: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z',
  wheel: 'M12 5a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 5v16M5.07 9l13.86 8M18.93 9L5.07 17M9.5 1.5h5L12 4.5z',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="name === 'drag' ? 3.2 : 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
