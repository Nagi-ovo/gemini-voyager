/**
 * Dragging a conversation out of ChatGPT's sidebar onto a Voyager folder.
 *
 * Sidebar rows are dnd-kit draggables (drag-to-Project). While its pointer
 * sensor runs, dnd-kit cancels every HTML5 `dragstart` on the window, and a
 * native drag would end its own drag with `pointercancel`. So this rides along
 * on the same pointer gesture instead: it only listens, never cancels or stops
 * an event, and never touches ChatGPT's nodes. Past a small move, the folder
 * under the pointer lights up; releasing over it files the conversation.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import {
  type FolderDropTarget,
  showDropTarget,
} from '@/pages/content/folder/floatingTree/dropTargets';

import { CHATGPT_CONVERSATION_ID_PREFIX } from './chatgptIdentity';
import { findChatGptSidebar, readSidebarLink, readSidebarTitle } from './chatgptSidebarDom';

export type DroppedConversation = Pick<ConversationReference, 'conversationId' | 'title' | 'url'>;

export interface RowDragOptions {
  untitled: () => string;
  /** The Voyager folder drop target under a viewport point. */
  dropTargetAt: (x: number, y: number) => FolderDropTarget | null;
  onDrop: (folderId: string, conversation: DroppedConversation) => void;
}

/** How far a press moves before it counts as a drag, in CSS pixels. */
const DRAG_THRESHOLD_PX = 5;

interface Gesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly conversation: DroppedConversation;
  dragging: boolean;
  over: FolderDropTarget | null;
}

function sidebarConversationAt(
  target: EventTarget | null,
  untitled: () => string,
): DroppedConversation | null {
  const link = target instanceof Element ? target.closest('a[href]') : null;
  if (!link || !findChatGptSidebar()?.contains(link)) return null;
  const row = readSidebarLink(link);
  if (!row) return null;
  return {
    conversationId: `${CHATGPT_CONVERSATION_ID_PREFIX}${row.id}`,
    title: readSidebarTitle(row) || untitled(),
    url: `${location.origin}${row.path}`,
  };
}

/** Makes ChatGPT's sidebar rows drag sources for Voyager folders while `scope` lives. */
export function bindChatGptRowDrag(scope: PluginScope, options: RowDragOptions): void {
  let gesture: Gesture | null = null;

  const hover = (over: FolderDropTarget | null): void => {
    if (!gesture || gesture.over?.element === over?.element) return;
    showDropTarget(gesture.over, false);
    showDropTarget(over, true);
    gesture.over = over;
  };

  const abort = (): void => {
    hover(null);
    gesture = null;
  };

  const press = (event: PointerEvent): void => {
    abort();
    if (!event.isPrimary || event.button !== 0) return;
    const conversation = sidebarConversationAt(event.target, options.untitled);
    if (!conversation) return;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      conversation,
      dragging: false,
      over: null,
    };
  };

  // By point, not `event.target`: dnd-kit's dragged row and pointer capture can retarget events.
  const move = (event: PointerEvent): void => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const { startX, startY } = gesture;
    if (!gesture.dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD_PX) return;
      gesture.dragging = true;
    }
    hover(options.dropTargetAt(event.clientX, event.clientY));
  };

  const release = (event: PointerEvent): void => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const { dragging, conversation } = gesture;
    abort();
    const target = dragging ? options.dropTargetAt(event.clientX, event.clientY) : null;
    if (target) options.onDrop(target.folderId, conversation);
  };

  const escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') abort();
  };

  scope.on(window, 'pointerdown', press, { capture: true });
  scope.on(window, 'pointermove', move, { capture: true });
  scope.on(window, 'pointerup', release, { capture: true });
  scope.on(window, 'pointercancel', abort, { capture: true });
  scope.on(window, 'keydown', escape, { capture: true });
  scope.on(window, 'blur', abort);
  scope.effect(() => abort, 'chatgpt-folders:row-drag');
}
