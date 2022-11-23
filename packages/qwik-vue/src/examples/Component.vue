<template>
  <div>
    <p>Vue Label: {{ label }}</p>
    <van-button type="primary" @click="onClick">Vue Button: {{ count }}</van-button>
    <br />
    <slot />
    <p>Data provided by global App passed to vue QwikVue Vite Plugin : {{ injected }}</p>
  </div>
</template>

<script lang="ts">
import { inject, onMounted, ref } from 'vue';
import { Button } from 'vant';

export default {
  components: {
    VanButton: Button,
  },
  props: {
    label: {
      type: String,
      default: 'No label',
    },
  },
  emits: ['click', 'mounted'],
  setup(props, { emit }) {
    const injected = inject('injected');
    const count = ref(0);
    function onClick() {
      count.value++;
      emit('click', count.value);
    }

    onMounted(() => {
      emit('mounted');
    });

    return {
      count,
      onClick,
      injected,
    };
  },
};
</script>

<style scoped>
p {
  color: red;
}
</style>
