import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'siteCheck',
  sinceEngine: 'next',
  // Reads every key the site defines and every selector the page's plugins use; none is required.
  semantic: [],
  params: {},
  description:
    'A small launcher opens a site check: every semantic selector of the site and every selector the running plugins rely on, with its match count on this page, plus an element picker that adds the picked element’s sanitized structure. The person reads the report before copying it, downloading it or opening an issue; it carries no page text, titles, account details or full URLs.',
};
