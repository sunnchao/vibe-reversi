<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from 'vue';
import AppIcon from './AppIcon.vue';
defineOptions({ options: { styleIsolation: 'shared', virtualHost: true } });
const props = withDefaults(defineProps<{
  open: boolean; title: string; name: string;
  kind?: 'sheet' | 'dialog' | 'actions'; footer?: string;
}>(), { kind: 'sheet' });
const emit = defineEmits<{ close: []; key: [key: string]; footer: [] }>();
function close() { if (props.open) emit('close'); }
// #ifdef H5
let previousFocus: HTMLElement | null = null;
let actionSource: HTMLElement | null = null;
function focusable() {
  return Array.from(document.querySelectorAll<HTMLElement>('.sheet button,.sheet uni-button,.sheet input,.sheet textarea,.sheet [tabindex]'))
    .filter(el => el.tabIndex >= 0 && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0);
}
function rememberSource(event: MouseEvent) {
  const source = (event.target as Element)?.closest<HTMLElement>('button,uni-button,[role="button"]');
  if (!props.open && source && !source.closest('.sheet-overlay')) actionSource = source;
}
watch(() => [props.open, props.name] as const, async ([open], previous) => {
  if (open) {
    if (!previous?.[0]) previousFocus = actionSource?.isConnected ? actionSource : document.activeElement as HTMLElement;
    await nextTick();
    if (props.open) focusable()[0]?.focus({ preventScroll: true });
  } else if (previous?.[0]) {
    const target = previousFocus;
    previousFocus = null;
    actionSource = null;
    await nextTick();
    if (!props.open && target?.isConnected && !target.closest('[inert]') && target.getClientRects().length) target.focus({ preventScroll: true });
  }
}, { immediate: true });
function onKey(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
  if (props.name === 'replay' && !(event.target as Element).closest('input,uni-slider')) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); emit('key', event.key); return; }
  }
  if (event.key !== 'Tab') return;
  const elements = focusable();
  const first = elements[0], last = elements[elements.length - 1], active = document.activeElement;
  if (!first) return;
  if (event.shiftKey && (active === first || !elements.includes(active as HTMLElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (active === last || !elements.includes(active as HTMLElement))) { event.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', onKey, true);
document.addEventListener('click', rememberSource, true);
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('click', rememberSource, true);
});
// #endif
</script>
<template>
  <view v-if="open" class="sheet-overlay">
    <view class="sheet-dismiss" aria-hidden="true" @click="close" />
    <view class="sheet" :class="{ dialog: kind === 'dialog', 'action-sheet': kind === 'actions' }" role="dialog" aria-modal="true"
      :aria-labelledby="kind === 'sheet' ? 'sheet-title' : undefined" :aria-label="kind !== 'sheet' ? title : undefined" data-od-id="interaction-sheet">
      <view v-if="kind === 'sheet'" class="sheet-head">
        <view id="sheet-title" class="h2">{{ title }}</view>
        <button role="button" tabindex="0" hover-class="none" class="icon-btn" aria-label="关闭弹窗" data-od-id="sheet-close" @click="close"><AppIcon name="close" /></button>
      </view>
      <scroll-view :key="name" scroll-y class="sheet-body"><slot /></scroll-view>
      <view v-if="kind === 'sheet' && footer" class="sheet-footer">
        <button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="sheet-footer-action" @click="emit('footer')">{{ footer }}</button>
      </view>
    </view>
  </view>
</template>
