/**
 * The body of one operation section (its `##` stays in the markdown above).
 * With `side="end"`, the section's `<GuideShot>` moves into a column at the
 * inline end once the column is wide enough, and comes first when it is not.
 * Without `side`, everything stays in the order the page wrote it.
 */
import { type PropType, type VNode, Fragment, defineComponent, h } from 'vue';

import GuideShot from './GuideShot.vue';

function flatten(nodes: VNode[]): VNode[] {
  return nodes.flatMap((node) =>
    node.type === Fragment && Array.isArray(node.children)
      ? flatten(node.children as VNode[])
      : [node],
  );
}

export default defineComponent({
  name: 'GuideOp',
  props: { side: { type: String as PropType<'end'>, default: undefined } },
  setup(props, { slots }) {
    return () => {
      const children = flatten(slots.default?.() ?? []);
      if (props.side !== 'end') return h('div', { class: 'gvg-op' }, children);
      const shots = children.filter((node) => node.type === GuideShot);
      const text = children.filter((node) => node.type !== GuideShot);
      return h('div', { class: 'gvg-op gvg-op--end' }, [
        h('div', { class: 'gvg-op-grid' }, [
          h('div', { class: 'gvg-op-shot' }, shots),
          h('div', { class: 'gvg-op-text' }, text),
        ]),
      ]);
    };
  },
});
