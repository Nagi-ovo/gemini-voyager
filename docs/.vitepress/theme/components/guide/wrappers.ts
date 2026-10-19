/**
 * Guide-page blocks that only frame their slot; `guide.css` styles them.
 * `<GuideFacts>` grids `<GuideFact>` cards, `<GuideSteps>` numbers its
 * `<GuideStep>` rows with a CSS counter, `<GuideNote>` is an aside.
 */
import { type Component, defineComponent, h } from 'vue';

function wrapper(name: string, tag: string, className: string, role?: string): Component {
  return defineComponent({
    name,
    setup(_, { slots }) {
      return () => h(tag, { class: className, role }, slots.default?.());
    },
  });
}

export const GuideFacts = wrapper('GuideFacts', 'div', 'gvg-facts');
// The rows are divs so a step can hold a screenshot; the roles keep them a list to a screen reader.
export const GuideSteps = wrapper('GuideSteps', 'div', 'gvg-steps', 'list');
export const GuideNote = wrapper('GuideNote', 'aside', 'gvg-note');

export const GuideStep = defineComponent({
  name: 'GuideStep',
  setup(_, { slots }) {
    return () =>
      h('div', { class: 'gvg-step', role: 'listitem' }, [
        h('div', { class: 'gvg-step-body' }, slots.default?.()),
      ]);
  },
});
