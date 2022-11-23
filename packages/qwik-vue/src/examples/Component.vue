<template>
  <div>
    <button @click="onClick">{{ label }}: {{ count }}</button>
    <br />
    <slot />
    <br />
    {{ injected }}
  </div>
</template>

<script lang="ts">
import { inject, ref } from 'vue';

export default {
  props: {
    label: {
      type: String,
      default: 'No label',
    },
  },
  setup() {
    const injected = inject('injected');
    const count = ref(0);
    function onClick() {
      count.value++;
    }

    return {
      count,
      onClick,
      injected,
    };
  },
};
</script>
