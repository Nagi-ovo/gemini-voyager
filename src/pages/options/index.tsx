import React from 'react';
import { createRoot } from 'react-dom/client';

import '@pages/options/index.css';
import Popup from '@pages/popup/Popup';
import '@pages/popup/index.css';

import '@assets/styles/tailwind.css';

import { LanguageProvider } from '../../contexts/LanguageContext';

function getSourceTabId(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('sourceTabId');
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function init() {
  const rootContainer = document.querySelector('#__root');
  if (!rootContainer) throw new Error("Can't find Options root element");
  const root = createRoot(rootContainer);
  root.render(
    <LanguageProvider>
      <Popup sourceTabId={getSourceTabId()} />
    </LanguageProvider>,
  );
}

init();
