<!--
  A team's players under its name, on every player card and the cricket
  board: in throwing order, the one at the oche marked.
-->
<script setup lang="ts">
import type { MemberChip } from '../game/sides.js';

defineProps<{ members: readonly MemberChip[] }>();
</script>

<template>
  <span class="team-members">
    <span v-for="member in members" :key="member.id" :class="['team-member', { 'team-member-on': member.on }]" :aria-current="member.on ? 'true' : undefined">
      {{ member.name }}
    </span>
  </span>
</template>
