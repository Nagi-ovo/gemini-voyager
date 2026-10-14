<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { promptReply, renderAnswer } from '../answer';
import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const prompt = computed(
  () => content.value.promptList.find((p) => p.reply === 'summary') ?? content.value.promptList[0],
);
const answerHtml = computed(() => {
  const c = content.value;
  const chat = c.chats[c.current];
  return chat && prompt.value
    ? renderAnswer(promptReply(prompt.value.reply, chat, c.replyLeads))
    : '';
});

const icon = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;

// Same format as the demo's stamps (YYYY-MM-DD HH:mm), so the new turn reads as "just now".
const pad = (n: number) => String(n).padStart(2, '0');
const format = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const typed = ref(0); // characters typed into the composer
const composing = ref(false);
const sent = ref('');
const answered = ref(false);
const draft = computed(() => (prompt.value?.text ?? '').slice(0, typed.value));

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
let typeTimer: ReturnType<typeof setInterval> | undefined;

// The demo renders every stamp at once; staggering their fade-in reads as "one per message".
function staggerStamps() {
  const stamps = stage.chatEl?.querySelectorAll<HTMLElement>('.gvf-stamp') ?? [];
  stamps.forEach((el, i) => (el.style.animationDelay = `${i * 110}ms`));
}

function send() {
  clearInterval(typeTimer);
  composing.value = false;
  sent.value = format(new Date());
  nextTick(() => stage.scrollChatToEnd());
}
function answer() {
  answered.value = true;
  nextTick(() => stage.scrollChatToEnd());
}

onMounted(() => {
  stage.view.timestamps = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    send();
    answer();
    return;
  }
  nextTick(staggerStamps);
  at(1000, () => stage.scrollChatToEnd());
  at(1600, () => {
    composing.value = true;
    const total = prompt.value?.text.length ?? 0;
    const step = Math.max(14, Math.min(45, 900 / Math.max(total, 1)));
    typeTimer = setInterval(() => {
      typed.value++;
      if (typed.value >= total) clearInterval(typeTimer);
    }, step);
  });
  at(2900, send);
  at(3900, answer);
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  clearInterval(typeTimer);
});
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-if="sent" class="gvf-ts-turn">
      <time class="gvf-stamp gvf-ts-now">{{ sent }}</time>
      <div class="gvf-q">{{ prompt?.text }}</div>
      <div v-if="!answered" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <div v-else class="gvf-a gvf-ts-answer" v-html="answerHtml" />
    </div>
  </Teleport>
  <Teleport v-if="stage.regions.composerCover && composing" :to="stage.regions.composerCover">
    <div class="gvf-ts-composer" aria-hidden="true">
      <div class="gvf-composer">
        <div class="gvf-composer-text" :class="{ empty: !draft }">
          {{ draft || content.composer.placeholder }}<span v-if="draft" class="gvf-ts-caret" />
        </div>
        <div class="gvf-composer-bar">
          <span class="gvf-icon-btn" v-html="icon('plus')" />
          <button
            type="button"
            class="gvf-icon-btn gvf-send"
            tabindex="-1"
            :disabled="!draft"
            v-html="icon('arrow-up')"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same box as the demo's .gvf-turn; kept separate so the timeline does not count it. */
.gvf-ts-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-ts-in 0.35s ease both;
}
@keyframes gvf-ts-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
.gvf-ts-answer {
  animation: gvf-ts-in 0.35s ease both;
}
.gvf-ts-now {
  border-radius: 6px;
  padding-inline: 4px;
  margin-inline-end: -4px;
  animation:
    gvf-ts-in 0.4s ease both,
    gvf-ts-flash 1.8s ease-out 0.2s;
}
@keyframes gvf-ts-flash {
  0%,
  45% {
    background: var(--gv-brand-soft);
    color: var(--gv-chip-fg);
    box-shadow: 0 0 0 3px var(--gv-brand-soft);
  }
}
/* Same box as the demo's composer row, so the swap is invisible. */
.gvf-ts-composer {
  position: absolute;
  inset: 0;
  padding: 4px 14px 14px;
  background: var(--host-bg);
}
.gvf-ts-caret {
  display: inline-block;
  width: 1.5px;
  height: 1.1em;
  margin-inline-start: 1px;
  vertical-align: text-bottom;
  background: var(--host-text);
  animation: gvf-ts-caret 1s steps(1) infinite;
}
@keyframes gvf-ts-caret {
  50% {
    opacity: 0;
  }
}
</style>
