import React, { useEffect, useRef, useState } from 'react';

import { Palette, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface ThemeColorButtonProps {
  /** SiteAdapter id of the active tab; null when the site is unknown. */
  siteId: string | null;
  /** Human-friendly site name shown as the override scope. */
  siteLabel: string;
  /** The site's default accent (hex) — what "reset" returns to. */
  defaultColor: string;
  /** The saved per-site override (hex), or null when none is set. */
  value: string | null;
  /** Persist a new override, or null to clear it back to the default. */
  onChange: (next: string | null) => void;
}

/** Normalize to a 6-digit `#rrggbb` that <input type="color"> accepts. */
function toHex6(color: string, fallback = '#5f8f55'): string {
  const hex = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return fallback;
}

/**
 * Header control to customize Voyager's accent colour for the CURRENT site.
 * Clicking the palette opens a popover with a native colour wheel and a
 * reset-to-default. The override is saved per site (Gemini, Claude, …), so each
 * platform keeps its own colour; sites without an override use their default.
 */
export const ThemeColorButton: React.FC<ThemeColorButtonProps> = ({
  siteId,
  siteLabel,
  defaultColor,
  value,
  onChange,
}) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const effective = value ?? defaultColor;
  const hasCustom = value !== null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Unknown site (no adapter) → nothing to scope an override to.
  if (!siteId) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        title={t('themeColor')}
        className="h-9 w-9"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Palette className="h-4 w-4" style={{ color: effective }} />
        <span className="sr-only">{t('themeColor')}</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label={t('themeColor')}
          className="border-border bg-background absolute right-0 z-50 mt-2 w-60 rounded-xl border p-3 shadow-xl"
        >
          <div className="text-foreground text-sm font-semibold">{t('themeColor')}</div>
          <p className="text-foreground/60 mt-1 mb-3 text-xs leading-snug">{t('themeColorDesc')}</p>

          <div className="flex items-center gap-3">
            <label
              className="relative h-10 w-10 shrink-0 cursor-pointer rounded-full border border-black/10 shadow-inner"
              style={{ background: effective }}
              title={t('themeColor')}
            >
              <input
                type="color"
                value={toHex6(effective, toHex6(defaultColor))}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t('themeColor')}
              />
            </label>
            <div className="min-w-0 flex-1">
              <div className="text-foreground font-mono text-xs tracking-wide uppercase">
                {toHex6(effective, toHex6(defaultColor))}
              </div>
              <div className="text-foreground/55 truncate text-[11px]">{siteLabel}</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={!hasCustom}
            onClick={() => onChange(null)}
            className="mt-3 h-7 w-full justify-center gap-1.5 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            {t('themeColorReset')}
          </Button>
        </div>
      )}
    </div>
  );
};
