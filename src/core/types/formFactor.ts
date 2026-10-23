/**
 * The device class Voyager runs on. A phone is `mobile` (Firefox for Android
 * and its forks); everything else is `desktop`. Kept free of browser APIs: the
 * plugin manifest validator, which the CLI bundles, reads this list.
 */
export const FORM_FACTORS = ['desktop', 'mobile'] as const;

export type FormFactor = (typeof FORM_FACTORS)[number];

export function isFormFactor(value: unknown): value is FormFactor {
  return (FORM_FACTORS as readonly unknown[]).includes(value);
}
