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
  | 'pencil';

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
