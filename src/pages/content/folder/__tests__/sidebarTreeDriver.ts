import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';

import { treeDriver } from '../floatingTree/__tests__/treeDriver';
import { SIDEBAR_TREE_HOST_CLASS } from '../sidebarTree';

/** Where Gemini's sidebar draws its folder tree: the shadow root under the panel's list. */
export function sidebarTreeRoot(panel: ParentNode | null | undefined): ShadowRoot {
  const root = panel?.querySelector(`.${SIDEBAR_TREE_HOST_CLASS}`)?.shadowRoot;
  if (!root) throw new Error('the folder panel shows no tree');
  return root;
}

/** Drives the sidebar's tree with the shared tree driver, re-reading the root on each call. */
export function sidebarTree(panel: ParentNode | null | undefined) {
  return treeDriver({ root: sidebarTreeRoot(panel), rootBucketId: ROOT_CONVERSATIONS_ID });
}
