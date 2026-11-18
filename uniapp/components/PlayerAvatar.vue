<script setup lang="ts">
import { ref, watch } from 'vue';

defineOptions({ options: { styleIsolation: 'shared', virtualHost: true } });
const props = defineProps<{ src: string; imageClass: string }>();
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>

<template>
  <image v-if="src && !failed" :key="src" :src="src" :class="imageClass" mode="aspectFill" aria-hidden="true" @error="failed = true" />
  <slot v-else />
</template>
