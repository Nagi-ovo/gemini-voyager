import type { ComponentProps, ReactNode } from 'react';

import { DarkModeToggle } from '@/components/DarkModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import type { TranslationKey } from '@/utils/translations';

import { ThemeColorButton } from './ThemeColorButton';

/**
 * The popup's title row, with the search and table of contents under it as
 * `children`. It stays at the top while the settings scroll beneath it.
 */
export function PopupHeader({
  themePicker,
  t,
  children,
}: {
  themePicker: ComponentProps<typeof ThemeColorButton>;
  t: (key: TranslationKey) => string;
  children?: ReactNode;
}) {
  return (
    <header
      data-popup-header
      className="bg-background/85 border-border/60 sticky top-0 z-20 border-b backdrop-blur-md"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h1 className="text-primary text-2xl font-extrabold tracking-tight">{t('extName')}</h1>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <ThemeColorButton {...themePicker} />
          <LanguageSwitcher />
        </div>
      </div>
      {children && <div className="px-5 pb-2.5">{children}</div>}
    </header>
  );
}
