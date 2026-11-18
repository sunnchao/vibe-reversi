<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
defineOptions({ options: { styleIsolation: 'shared', virtualHost: true } });
const props = withDefaults(defineProps<{
  board: number[]; legal?: number[]; turn?: number; last?: number; hint?: number;
  canPlay?: boolean; kind?: 'play' | 'result' | 'replay'; changed?: number[];
  effects?: boolean; effect?: { index: number; bomb: boolean; key: number } | null;
}>(), { legal: () => [], changed: () => [], turn: 1, last: -1, hint: -1, canPlay: false, kind: 'play', effects: true, effect: null });
const emit = defineEmits<{ move: [index: number] }>();
const focused = ref(-1);
let keyboard = false;
const legalSet = computed(() => new Set(props.legal));
const firstFocus = computed(() => {
  if (!props.canPlay || !props.legal.length) return -1;
  const from = focused.value >= 0 ? focused.value : props.last;
  return from < 0 ? props.legal[0] : [...props.legal].sort((a, b) => distance(a, from) - distance(b, from))[0];
});
const coordinates = (i: number) => 'ABCDEFGH'[i % 8] + (Math.floor(i / 8) + 1);
function distance(a: number, b: number) { return Math.abs((a >> 3) - (b >> 3)) + Math.abs(a % 8 - b % 8); }
function label(i: number) {
  return `${coordinates(i)}，${props.board[i] === 1 ? '黑棋' : props.board[i] === 2 ? '白棋' : legalSet.value.has(i) ? '可落子' : '空格'}${props.last === i ? '，上一手' : ''}${props.hint === i ? '，建议落点' : ''}`;
}
function focusCell(i: number) {
  focused.value = i;
  // #ifdef H5
  nextTick(() => document.querySelector<HTMLElement>(`.cell[data-index="${i}"]`)?.focus({ preventScroll: true }));
  // #endif
}
function onKey(event: KeyboardEvent, i: number) {
  if (!props.canPlay) return;
  const direction: Record<string, number[]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  const step = direction[event.key];
  keyboard = true;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); emit('move', i); return; }
  if (!step) return;
  event.preventDefault();
  let r = (i >> 3) + step[0], c = i % 8 + step[1];
  while (r >= 0 && r < 8 && c >= 0 && c < 8) {
    const next = r * 8 + c;
    if (legalSet.value.has(next)) { focusCell(next); return; }
    r += step[0]; c += step[1];
  }
}
watch(() => [props.canPlay, props.last], () => {
  if (keyboard && props.canPlay && firstFocus.value >= 0) {
    // #ifdef H5
    if (!document.querySelector('.sheet-overlay:not(.is-closing)')) focusCell(firstFocus.value);
    // #endif
  }
});
</script>
<template>
  <view v-if="kind === 'play'" class="board-frame" data-od-id="wood-board-frame">
    <view class="board-labels" aria-hidden="true"><text v-for="letter in 'ABCDEFGH'" :key="letter" class="text">{{ letter }}</text></view>
    <view class="board-ranks" aria-hidden="true"><text v-for="rank in 8" :key="rank" class="text">{{ rank }}</text></view>
    <view id="board" class="board" :data-turn="turn" role="group" aria-label="8乘8黑白棋棋盘" data-od-id="interactive-board">
      <button role="button" hover-class="cell-pressed" :hover-start-time="0" :hover-stay-time="0" v-for="(value, i) in board" :key="i" :data-index="i" :data-od-id="`board-cell-${coordinates(i).toLowerCase()}`"
        class="cell" :class="{ legal: canPlay && legalSet.has(i), last: last === i, suggested: hint === i }"
        :disabled="!canPlay || !legalSet.has(i)" :tabindex="firstFocus === i ? 0 : -1" :aria-label="label(i)"
        @click="emit('move', i)" @keydown="onKey($event, i)" @mousedown="keyboard = false">
        <view v-if="value" class="i stone" :class="{ white: value === 2, drop: effects && changed.includes(i) && last === i, flip: effects && changed.includes(i) && last !== i }"
          :style="{ '--old-fill': value === 1 ? 'var(--ivory)' : 'var(--black)', animationDelay: `${Math.min(changed.indexOf(i) * 32, 160)}ms` }" aria-hidden="true" />
      </button>
      <view v-if="effects && effect" :key="effect.key" class="blast" :class="{ bomb: effect.bomb }" :style="{ '--x': effect.index % 8, '--y': Math.floor(effect.index / 8) }" aria-hidden="true"><view class="blast-center" /></view>
    </view>
  </view>
  <view v-else :class="kind === 'replay' ? 'replay-board' : 'result-board'" role="img" :aria-label="`棋盘，黑棋 ${board.filter(v => v === 1).length} 子，白棋 ${board.filter(v => v === 2).length} 子`">
    <view v-for="(value, i) in board" :key="i" class="text" :class="{ last: kind === 'replay' && last === i }"><view v-if="value" class="i stone" :class="{ white: value === 2 }" /></view>
  </view>
</template>
