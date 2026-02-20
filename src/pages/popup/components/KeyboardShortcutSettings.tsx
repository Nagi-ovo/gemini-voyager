import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { keyboardShortcutService } from '@/core/services/KeyboardShortcutService';
import type {
  KeyboardShortcutConfig,
  ModifierKey,
  ShortcutKey,
} from '@/core/types/keyboardShortcut';

interface RecordingState {
  action: 'previous' | 'next' | null;
  modifiers: ModifierKey[];
  key: ShortcutKey | null;
}

export function KeyboardShortcutSettings() {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [config, setConfig] = useState<KeyboardShortcutConfig | null>(null);
  const [recording, setRecording] = useState<RecordingState>({
    action: null,
    modifiers: [],
    key: null,
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Use refs to avoid stale closures in event handlers
  const configRef = useRef<KeyboardShortcutConfig | null>(null);
  const enabledRef = useRef<boolean>(true);
  const recordingRef = useRef<RecordingState>({ action: null, modifiers: [], key: null });

  // Keep refs in sync with state
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  // Load configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Initialize service first to load from storage
        await keyboardShortcutService.init();

        // Then get the loaded config
        const { config: currentConfig, enabled: currentEnabled } =
          keyboardShortcutService.getConfig();
        setConfig(currentConfig);
        setEnabled(currentEnabled);
      } catch (error) {
        console.error('[KeyboardShortcut] Failed to load config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Toggle enabled state
  const handleToggleEnabled = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    try {
      await keyboardShortcutService.setEnabled(checked);
    } catch (error) {
      console.error('[KeyboardShortcut] Failed to toggle enabled:', error);
    }
  }, []);

  // Start recording shortcut
  const startRecording = useCallback((action: 'previous' | 'next') => {
    setRecording({ action, modifiers: [], key: null });
  }, []);

  // Handle key press during recording
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    const currentRecording = recordingRef.current;
    const currentConfig = configRef.current;
    const currentEnabled = enabledRef.current;

    if (!currentRecording.action) return;

    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording
    if (e.key === 'Escape') {
      setRecording({ action: null, modifiers: [], key: null });
      return;
    }

    // Ignore modifier keys alone (they can't be shortcuts by themselves)
    if (['Alt', 'Control', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) {
      return;
    }

    // Accept any key! Normalize arrow keys for consistency
    let key: ShortcutKey;
    if (e.key === 'Up') {
      key = 'ArrowUp';
    } else if (e.key === 'Down') {
      key = 'ArrowDown';
    } else if (e.key === 'Left') {
      key = 'ArrowLeft';
    } else if (e.key === 'Right') {
      key = 'ArrowRight';
    } else {
      key = e.key;
    }

    // Extract modifiers
    const modifiers: ModifierKey[] = [];
    if (e.altKey) modifiers.push('Alt');
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    // Update config
    if (!currentConfig) return;

    const updatedConfig: KeyboardShortcutConfig = {
      ...currentConfig,
      [currentRecording.action]: {
        action: `timeline:${currentRecording.action}` as const,
        modifiers,
        key,
      },
    };

    try {
      await keyboardShortcutService.saveConfig(updatedConfig, currentEnabled);
      setConfig(updatedConfig);
      setRecording({ action: null, modifiers: [], key: null });
    } catch (error) {
      console.error('[KeyboardShortcut] Failed to save shortcut:', error);
    }
  }, []);

  // Attach/detach keydown listener
  useEffect(() => {
    if (recording.action) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => {
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    }
  }, [recording.action, handleKeyDown]);

  // Reset to defaults
  const handleReset = useCallback(async () => {
    try {
      await keyboardShortcutService.resetToDefaults();
      const { config: currentConfig } = keyboardShortcutService.getConfig();
      setConfig(currentConfig);
    } catch (error) {
      console.error('[KeyboardShortcut] Failed to reset shortcuts:', error);
    }
  }, []);

  if (loading || !config) {
    return (
      <Card className="p-4">
        <CardTitle className="mb-4 text-xs tracking-wide uppercase">
          {t('keyboardShortcuts')}
        </CardTitle>
        <CardContent className="p-0">
          <p className="text-muted-foreground text-xs">{t('loading')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-4 transition-shadow hover:shadow-lg">
      <CardTitle className="mb-4 text-xs tracking-wide uppercase">
        {t('keyboardShortcuts')}
      </CardTitle>
      <CardContent className="space-y-6 p-0">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="shortcuts-enabled" className="cursor-pointer text-sm font-medium">
            {t('enableShortcuts')}
          </Label>
          <Switch
            id="shortcuts-enabled"
            checked={enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
          />
        </div>

        {/* Shortcut Configuration */}
        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-4 pt-2">
              {/* Previous Node */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs font-medium">
                  {t('previousNode')}
                </Label>
                <button
                  type="button"
                  onClick={() => startRecording('previous')}
                  className={`flex w-full items-center justify-center rounded-lg border-2 px-4 py-3 font-mono text-sm font-semibold transition-all ${
                    recording.action === 'previous'
                      ? 'border-primary bg-primary/5 text-primary animate-pulse'
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  } `}
                >
                  {recording.action === 'previous'
                    ? 'Press key...'
                    : keyboardShortcutService.formatShortcut(config.previous)}
                </button>
              </div>

              {/* Next Node */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs font-medium">{t('nextNode')}</Label>
                <button
                  type="button"
                  onClick={() => startRecording('next')}
                  className={`flex w-full items-center justify-center rounded-lg border-2 px-4 py-3 font-mono text-sm font-semibold transition-all ${
                    recording.action === 'next'
                      ? 'border-primary bg-primary/5 text-primary animate-pulse'
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  } `}
                >
                  {recording.action === 'next'
                    ? 'Press key...'
                    : keyboardShortcutService.formatShortcut(config.next)}
                </button>
              </div>
            </div>

            {/* Hint text */}
            {recording.action && (
              <p className="text-muted-foreground animate-in fade-in text-center text-xs">
                Press Esc to cancel
              </p>
            )}

            {/* Reset button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 transition-colors hover:underline"
              >
                {t('resetShortcuts')}
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
