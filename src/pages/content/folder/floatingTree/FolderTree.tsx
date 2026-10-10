/** @jsxImportSource preact */
import { type ComponentChild, render } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';

import { ContextMenu } from './ContextMenu';
import { ConversationRow } from './conversationRow';
import { buildTreeProjection } from './projection';
import { CreateFolderRow, EmptyState, FolderRow, RootDropRow, RootTitleRow } from './rows';
import { type TreeProps, cls, t } from './shared';
import { retainTreeStyle } from './treeStyle';
import { type ProjectedTree, type Row, createTreeView } from './treeView';

type ViewProps = { tree: ProjectedTree; container: HTMLElement };

function FolderTreeView({ tree, container }: ViewProps) {
  const [, setTick] = useState(0);
  const [view] = useState(() => createTreeView(() => setTick((tick) => tick + 1)));
  const { frame: layOut, listRef, committed, destroy } = view;
  const frame = layOut(tree);
  const { rows, slots, measure } = frame;

  useLayoutEffect(() => retainTreeStyle(container), [container]);
  useLayoutEffect(() => destroy, [destroy]);
  useLayoutEffect(() => committed());

  const renderRow = (row: Row, index: number): ComponentChild => {
    switch (row.kind) {
      case 'item':
        return row.node.kind === 'folder' ? (
          <FolderRow
            key={row.key}
            tree={tree}
            node={row.node}
            item={row.item}
            index={index}
            measure={measure}
            hidden={row.hidden}
          />
        ) : (
          <ConversationRow
            key={row.key}
            tree={tree}
            node={row.node}
            item={row.item}
            index={index}
            measure={measure}
          />
        );
      case 'create':
        return (
          <CreateFolderRow
            key={row.key}
            tree={tree}
            parentId={row.parentId}
            index={index}
            measure={measure}
            hidden={row.hidden}
          />
        );
      case 'root-drop':
        return <RootDropRow key={row.key} tree={tree} index={index} measure={measure} />;
      case 'root-title':
        return (
          <RootTitleRow
            key={row.key}
            tree={tree}
            labelKey={row.labelKey}
            index={index}
            measure={measure}
          />
        );
    }
  };

  const spacer = (key: string, height: number): ComponentChild => (
    <div
      key={key}
      class={cls('tree-spacer')}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    />
  );

  const children: ComponentChild[] = [];
  let cursor = 0;
  for (const [position, index] of frame.shown.entries()) {
    const row = rows[index];
    if (!row) continue;
    const slot = slots?.[position];
    if (slot && slot.top > cursor + 0.5) children.push(spacer(`gap:${index}`, slot.top - cursor));
    children.push(renderRow(row, index));
    if (slot) cursor = Math.max(cursor, slot.top + slot.size);
  }
  if (slots && frame.total > cursor + 0.5) children.push(spacer('gap:end', frame.total - cursor));

  // What the projection shows, so a site filter that leaves nothing shows the empty state.
  const empty =
    tree.projection.folders.length === 0 &&
    tree.projection.rootConversationCount === 0 &&
    tree.inlineEditor?.mode !== 'create';

  return (
    <>
      {empty && <EmptyState labelKey={tree.site?.emptyLabelKey} />}
      <div class={cls('tree')} role="tree" aria-label={t('floatingPanelTitle')} ref={listRef}>
        {children}
      </div>
      {!tree.menuInLayer && <ContextMenu {...tree} />}
    </>
  );
}

/**
 * Renders the tree into `container`, diffing against what is there; `null`
 * unmounts it. A caller without a projection gets one laid out per call.
 */
export function renderFolderTree(container: HTMLElement, tree: TreeProps | null): void {
  if (!tree) {
    render(null, container);
    return;
  }
  const projection = tree.projection ?? buildTreeProjection(tree);
  render(<FolderTreeView tree={{ ...tree, projection }} container={container} />, container);
}
