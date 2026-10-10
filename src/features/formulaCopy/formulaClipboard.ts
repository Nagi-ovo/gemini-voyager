import type { ILogger } from '@/core/types/common';

import { MATHML_NS } from './formulaCopyPayload';

/**
 * Copy text to clipboard using modern API with fallback
 */
export async function copyFormulaToClipboard(
  text: string,
  html: string | undefined,
  logger: ILogger,
): Promise<boolean> {
  // Try modern Clipboard API first (supports MIME types)
  if (navigator.clipboard?.write) {
    const items: Record<string, Blob> = {
      'text/plain': new Blob([text], { type: 'text/plain' }),
    };

    if (html) {
      items['text/html'] = new Blob([html], { type: 'text/html' });
      if (html.includes(`xmlns:mml="${MATHML_NS}"`)) {
        items['application/mathml+xml'] = new Blob([text], { type: 'application/mathml+xml' });
      }
    }

    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    } catch (error) {
      if (isMathMLClipboardUnsupported(error)) {
        return copyToClipboardLegacy(text, logger);
      }

      logger.error('Clipboard API failed, trying fallback', { error });
      return copyToClipboardLegacy(text, logger);
    }
  }

  // Fallback: If only writeText is available (no MIME support)
  if (navigator.clipboard?.writeText && !html) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      logger.error('Clipboard API failed, trying fallback', { error });
      return copyToClipboardLegacy(text, logger);
    }
  }

  // Fallback to execCommand for older browsers (text only)
  return copyToClipboardLegacy(text, logger);
}

/**
 * Legacy clipboard copy method using execCommand
 */
function copyToClipboardLegacy(text: string, logger: ILogger): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);

    return success;
  } catch (error) {
    logger.error('Legacy clipboard copy failed', { error });
    return false;
  }
}

function isMathMLClipboardUnsupported(error: unknown): boolean {
  const name = getErrorName(error);
  const nameMatches = name === 'notallowederror' || name === 'notsupportederror';
  if (!nameMatches) {
    return false;
  }

  const message = getErrorMessage(error);
  if (!message) {
    return true;
  }

  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes('mathml') || lowerMessage.includes('application/mathml+xml');
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : null;
}

function getErrorName(error: unknown): string | null {
  if (error instanceof DOMException) {
    return error.name.toLowerCase();
  }

  if (error instanceof Error) {
    return error.name.toLowerCase();
  }

  return null;
}
