/** @jsxImportSource preact */
import type { IconNode } from 'lucide-react';

export type { IconNode };

export {
  CHECK_ICON_NODE as CHECK,
  CHEVRON_RIGHT_ICON_NODE as CHEVRON_RIGHT,
  ELLIPSIS_ICON_NODE as ELLIPSIS,
  FOLDER_ICON_NODE as FOLDER,
  PIN_ICON_NODE as PIN,
  PLUS_ICON_NODE as PLUS,
  STAR_ICON_NODE as STAR,
  X_ICON_NODE as X,
} from '@/core/icons/folderIcons';

/**
 * A Lucide line icon for `lineIcons` trees, the set Gemini's folder header
 * draws with. It sizes to its control through the stylesheet and strokes in
 * `currentColor`; `filled` fills the shape too, as for a starred conversation.
 */
export function LineIcon({ node, filled }: { node: IconNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node.map(([tag, { key, ...attributes }]) => {
        const Tag = tag as 'path';
        return <Tag key={key} {...attributes} />;
      })}
    </svg>
  );
}
