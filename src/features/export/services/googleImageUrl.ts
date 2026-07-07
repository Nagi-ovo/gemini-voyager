const SIZE_PATTERN = /=[swh]\d+[^?#]*/;

/**
 * Replace Google image size parameters (=s220, =w512-h286, etc.) with =s0
 * to request original resolution. Also converts /rd-gg/ to /rd-gg-dl/ for
 * higher-quality downloads. Non-Google URLs are returned unchanged.
 */
export function getOriginalSizeGoogleImageUrl(url: string): string {
  const isGoogleImage = url.includes('googleusercontent.com') || url.includes('ggpht.com');
  if (!isGoogleImage) return url;

  if (url.includes('/rd-gg/') && !url.includes('/rd-gg-dl/')) {
    url = url.replace('/rd-gg/', '/rd-gg-dl/');
  }

  // Already at original size — don't modify (must check before SIZE_PATTERN
  // so =s0-d-I doesn't get stripped of its -d-I suffix)
  if (url.includes('=s0')) return url;

  if (SIZE_PATTERN.test(url)) {
    return url.replace(SIZE_PATTERN, '=s0');
  }

  if (url.includes('?')) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('s', '0');
      return parsed.toString();
    } catch {
      /* fall through */
    }
  }

  const basePath = url.split(/[?#]/)[0];
  const suffix = url.slice(basePath.length);
  if (basePath.includes('=')) {
    return basePath + '-s0' + suffix;
  }
  return basePath + '=s0' + suffix;
}
