<script setup lang="ts">
defineOptions({ options: { styleIsolation: 'shared', virtualHost: true } });
withDefaults(defineProps<{ name: string; tone?: 'ink' | 'ivory' | 'muted' | 'felt'; size?: number; end?: boolean }>(), { tone: 'ink', end: false });
</script>
<template>
  <image class="app-icon" :class="{ end }" :src="`/static/icons/${name}-${tone}.png`" :style="size ? { width: `${size}px`, height: `${size}px` } : undefined" mode="aspectFit" aria-hidden="true" />
</template>
<style>
.app-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
</style>
