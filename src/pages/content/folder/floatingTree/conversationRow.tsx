/** @jsxImportSource preact */
import { IconButton } from './controls';
import type { ConversationNode } from './projection';
import {
  type ItemRowProps,
  type PlacementOf,
  dropHandlers,
  edgeOf,
  isPlainClick,
  rowShell,
  treeItemProps,
} from './rows';
import { type ConversationDragData, FOLDER_DRAG_TYPE, cls, t } from './shared';
import { STAR, X } from './treeIcons';

const DRAGGING = cls('conv--dragging');

export function ConversationRow({
  tree,
  node,
  item,
  index,
  measure,
}: ItemRowProps<ConversationNode>) {
  const { conversation: conv, bucketId, folderDepth } = node;
  const { actions, site } = tree;
  const untitled = t('floatingPanelUntitled');
  const remove = () => actions.onRemoveConversation?.(bucketId, conv.conversationId);
  const active = site?.isActiveConversation
    ? site.isActiveConversation(conv, bucketId)
    : !!site?.activeConversationId && site.activeConversationId === conv.conversationId;
  const selected = !!site?.isConversationSelected?.(conv, bucketId);
  const shell = rowShell(index, folderDepth + 1);
  const atRoot = bucketId === tree.rootBucketId;
  const placementOf: PlacementOf | undefined = site?.reorder?.conversations
    ? (e) => {
        // A folder lands in this row's folder, not between its chats.
        if (e.dataTransfer?.types.includes(FOLDER_DRAG_TYPE)) return undefined;
        const position = edgeOf(e, 0.5);
        return position
          ? { kind: 'conversation', bucketId, conversationId: conv.conversationId, position }
          : undefined;
      }
    : undefined;
  // With folder-body drops, a row is part of its folder's block and takes the
  // drop for that folder. A root row has no folder block, but a drop beside it
  // still reorders the root.
  const drops =
    (site?.folderBodyDrop && !atRoot) || (placementOf && atRoot)
      ? dropHandlers(tree, bucketId, placementOf)
      : {};
  const classes = [cls('conv')];
  if (active) classes.push(cls('conv--active'));
  if (selected) classes.push(cls('conv--selected'));
  if (conv.starred) classes.push(cls('conv--starred'));
  const href = site?.conversationHref?.(conv);
  const icon = site?.conversationIcon?.(conv);
  const onTitleClick = (e: MouseEvent) => {
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>(`.${cls('conv')}`);
    if (row && actions.interceptConversationClick?.(e, conv, bucketId, row)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A link leaves modified and non-primary clicks to the browser: a new tab, say.
    if (href && (e.button !== 0 || e.altKey || !isPlainClick(e))) return;
    e.preventDefault();
    e.stopPropagation();
    if (isPlainClick(e)) actions.onNavigate?.(conv);
  };
  const titleProps = {
    class: cls('conv-title'),
    // Its own direction, so a name in the other script truncates at its end.
    dir: 'auto' as const,
    title: conv.title || '',
    'aria-current': active ? ('page' as const) : undefined,
    onClick: onTitleClick,
    onDblClick: actions.onRenameConversation
      ? (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          actions.onRenameConversation?.(conv);
        }
      : undefined,
  };
  const label = conv.title || untitled;
  const press = actions.onConversationPress;
  return (
    <div
      class={shell.class}
      data-index={shell['data-index']}
      data-guides={shell['data-guides']}
      ref={measure}
      style={shell.guideStyle}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- a treeitem (role from Headless Tree's props); the pointer handlers only report presses and menus */}
      <div
        {...treeItemProps(item)}
        class={classes.join(' ')}
        style={{ paddingInlineStart: `calc(24px + ${folderDepth} * var(--gv-tree-step, 12px))` }}
        data-folder-id={bucketId}
        data-conversation-id={conv.conversationId}
        draggable
        onDragStart={(e) => {
          const payload: ConversationDragData = {
            type: 'conversation',
            conversationId: conv.conversationId,
            sourceFolderId: bucketId,
          };
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/json', JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', conv.title || untitled);
          }
          e.currentTarget.classList.add(DRAGGING);
          actions.onConversationDragStart?.(e, conv, bucketId);
        }}
        onDragEnd={(e) => {
          e.currentTarget.classList.remove(DRAGGING);
          actions.onConversationDragEnd?.();
        }}
        onMouseDown={press && ((e) => press(e, conv, bucketId))}
        onMouseUp={press && (() => press(null, conv, bucketId))}
        onMouseLeave={press && (() => press(null, conv, bucketId))}
        onContextMenu={
          actions.onConversationMenu &&
          ((e) => {
            e.preventDefault();
            e.stopPropagation();
            actions.onConversationMenu?.(e, conv);
          })
        }
        {...drops}
      >
        {icon && (
          <span class={cls('conv-icon')} aria-hidden="true">
            {icon}
          </span>
        )}
        {href ? (
          <a {...titleProps} href={href} draggable={false}>
            {label}
          </a>
        ) : (
          <button type="button" {...titleProps}>
            {label}
          </button>
        )}
        <IconButton
          modifier="star"
          labelKey={
            conv.starred ? 'floatingPanelUnstarConversation' : 'floatingPanelStarConversation'
          }
          text={conv.starred ? '★' : '☆'}
          icon={site?.lineIcons ? STAR : undefined}
          active={conv.starred}
          onClick={(e) => {
            e.stopPropagation();
            actions.onToggleStar?.(conv.conversationId, !conv.starred);
          }}
        />
        <IconButton
          modifier="remove"
          labelKey="floatingPanelRemoveConversation"
          text="×"
          icon={site?.lineIcons ? X : undefined}
          onClick={(e) => {
            e.stopPropagation();
            const confirm = actions.confirmConversationRemoval;
            const button = e.currentTarget as HTMLElement;
            // The row, not the button: the confirm marks what it removes and lines up with the row.
            const row = button.closest<HTMLElement>(`.${cls('conv')}`) ?? button;
            if (confirm) confirm(conv.title || untitled, row, remove);
            else remove();
          }}
        />
      </div>
    </div>
  );
}
