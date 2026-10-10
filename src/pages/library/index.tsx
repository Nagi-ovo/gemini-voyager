import { createRoot } from 'react-dom/client';

import '@/assets/styles/tailwind.css';
import { LanguageProvider } from '@/contexts/LanguageContext';

import { Library } from './Library';
import './index.css';

const container = document.querySelector('#__root');
if (!container) throw new Error("Can't find Saved Library root element");
createRoot(container).render(
  <LanguageProvider>
    <Library />
  </LanguageProvider>,
);
