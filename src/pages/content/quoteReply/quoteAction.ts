import { getTranslationSync } from '@/utils/i18n';

import type { StopNativeFeature } from '../featureLifecycle';
import { registerSelectionAction } from '../selectionToolbar/host';
import { insertQuotedSelection } from './quoteInsertion';

const QUOTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;

function createQuoteIcon(): Node {
  const template = document.createElement('template');
  template.innerHTML = QUOTE_ICON;
  return template.content.firstElementChild ?? document.createTextNode('');
}

/** Offer Quote Reply on user and assistant selections; stop removes only this registration. */
export function startQuoteAction(): StopNativeFeature {
  return registerSelectionAction({
    id: 'quote',
    order: 10,
    className: 'gv-quote-btn',
    label: () => getTranslationSync('quoteReply'),
    createIcon: createQuoteIcon,
    isAvailable: () => true,
    run: (range) => insertQuotedSelection(range),
  });
}
