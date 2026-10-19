import inlineTreeCss from './floatingTree/inlineTree.css?raw';
import tokensCss from './sidebarTreeTokens.css?raw';

/**
 * Gemini's sidebar keeps the floating panel's tree, laid into the nav: the
 * shared inline tree sheet in Gemini's tokens. It follows the panel sheet; its
 * host carries `INLINE_TREE_ATTR`.
 */
export const SIDEBAR_TREE_CSS = `${inlineTreeCss}\n${tokensCss}`;
