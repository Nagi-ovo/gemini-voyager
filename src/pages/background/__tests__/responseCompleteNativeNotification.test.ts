import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Safari response notification handoff', () => {
  it('passes the exact conversation URL to the native notification bridge', () => {
    const source = readFileSync(resolve('src/pages/background/index.ts'), 'utf8');
    const nativeCall = source.match(
      /deliverSafariNativeNotification\(\{[\s\S]*?id: notificationId,[\s\S]*?title,[\s\S]*?body: message,[\s\S]*?url: conversationUrl,[\s\S]*?\}\)/,
    );

    expect(nativeCall).not.toBeNull();
  });

  it('keeps the app-to-Safari native port alive at module scope', () => {
    const source = readFileSync(resolve('src/pages/background/index.ts'), 'utf8');

    expect(source).toMatch(
      /let nativeOpenConversationPort:[\s\S]*?browser\.runtime\.connectNative[\s\S]*?= null;/,
    );
    expect(source).toContain('nativeOpenConversationPort = port;');
  });
});
