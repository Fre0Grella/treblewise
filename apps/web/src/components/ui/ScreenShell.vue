<!--
  The frame every screen shares: Back at the top left, the title and its lead
  line, the content, and the screen's own actions at the bottom.

  Back goes where the router's rule says (router/back.ts). A screen that has to
  ask before leaving (unsaved marks, say) handles `back` itself.
-->
<script setup lang="ts">
import { useStrings } from '../../i18n/index.js';
import { useBack } from '../../router/back.js';

const props = withDefaults(
  defineProps<{
    title: string;
    lead?: string;
    /** The modifier class, `screen-<name>`. */
    name?: string;
    /** Off on screens with nowhere to go back to. */
    back?: boolean;
    backLabel?: string;
    /** Greyed out, with the reason on screen: unsaved marks, say. */
    backDisabled?: boolean;
    /** Set to handle Back here instead of by the router's rule. */
    onBack?: () => void;
  }>(),
  { back: true, backDisabled: false },
);

const t = useStrings();
const goBack = useBack();
const pressBack = () => (props.onBack ? props.onBack() : goBack());
</script>

<template>
  <div class="screen" :class="name ? `screen-${name}` : undefined">
    <header class="screen-head">
      <button v-if="back" type="button" class="screen-back" :disabled="backDisabled" @click="pressBack">
        <span aria-hidden="true">‹</span> {{ backLabel ?? t.app.back }}
      </button>
      <h1>{{ title }}</h1>
      <p v-if="lead">{{ lead }}</p>
      <slot name="head" />
    </header>
    <slot />
    <div v-if="$slots.actions" class="screen-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
