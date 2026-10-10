import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_ENABLED_PLUGIN_IDS,
  isPluginEnabled,
} from '@/features/plugins/storage/pluginDefaults';
import {
  loadCollapsedPlugins,
  loadPluginState,
  setPluginCollapsed,
  setPluginSetting,
  setPluginSettings,
  subscribePluginState,
} from '@/features/plugins/storage/pluginState';
import type { PluginSettingValue } from '@/features/plugins/types';

export type EnabledMap = Readonly<Record<string, boolean>>;
type SettingsMap = Record<string, Record<string, PluginSettingValue>>;

function readState(
  state: Record<string, { enabled: boolean; settings?: Record<string, PluginSettingValue> }>,
): {
  enabled: EnabledMap;
  settings: SettingsMap;
} {
  const enabled: Record<string, boolean> = {};
  const settings: SettingsMap = {};
  for (const id of DEFAULT_ENABLED_PLUGIN_IDS) enabled[id] = isPluginEnabled(state, id);
  for (const [id, entry] of Object.entries(state)) {
    enabled[id] = isPluginEnabled(state, id);
    if (entry.settings) settings[id] = { ...entry.settings };
  }
  return { enabled, settings };
}

export function usePluginPreferences() {
  const [enabledMap, setEnabledMap] = useState<EnabledMap>({});
  const [settingsMap, setSettingsMap] = useState<SettingsMap>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Coalesced persistence for setting sliders (see handleSetting). Keyed by
  // `${pluginId}:${settingKey}` so independent sliders keep independent timers.
  const settingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSettings = useRef(
    new Map<string, { id: string; key: string; value: PluginSettingValue }>(),
  );

  useEffect(() => {
    let active = true;
    void loadPluginState().then((state) => {
      if (!active) return;
      const { enabled, settings } = readState(state);
      setEnabledMap(enabled);
      setSettingsMap(settings);
    });
    void loadCollapsedPlugins().then((ids) => {
      if (active) setCollapsed(new Set(ids));
    });
    const unsubscribe = subscribePluginState((state) => {
      const { enabled, settings } = readState(state);
      setEnabledMap(enabled);
      setSettingsMap(settings);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleSetting = useCallback((id: string, key: string, value: PluginSettingValue) => {
    // Keep the visible slider value instant via local state, but DEBOUNCE the
    // storage write. A range drag fires onChange on every step; each persist is
    // a read-modify-write of chrome.storage.local that, via storage.onChanged,
    // makes the content script re-render the plugin CSS and reflow the (wide)
    // thread. Writing per-tick would fire dozens of those round-trips + reflows
    // per drag (and the concurrent read-modify-writes could race). We coalesce
    // to the last value ~200ms after the user stops moving.
    setSettingsMap((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    const mapKey = `${id}:${key}`;
    pendingSettings.current.set(mapKey, { id, key, value });
    const existing = settingTimers.current.get(mapKey);
    if (existing) clearTimeout(existing);
    settingTimers.current.set(
      mapKey,
      setTimeout(() => {
        settingTimers.current.delete(mapKey);
        const pending = pendingSettings.current.get(mapKey);
        if (!pending) return;
        pendingSettings.current.delete(mapKey);
        void setPluginSetting(pending.id, pending.key, pending.value);
      }, 200),
    );
  }, []);

  const handleImmediateSettings = useCallback(
    (id: string, values: Readonly<Record<string, PluginSettingValue>>) => {
      setSettingsMap((prev) => ({ ...prev, [id]: { ...prev[id], ...values } }));
      void setPluginSettings(id, values);
    },
    [],
  );

  // Flush any pending setting write if the popup closes mid-drag, so the user's
  // final value is never lost to the debounce window.
  useEffect(() => {
    const timers = settingTimers.current;
    const pending = pendingSettings.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const { id, key, value } of pending.values()) void setPluginSetting(id, key, value);
      pending.clear();
    };
  }, []);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const willCollapse = !prev.has(id);
      if (willCollapse) next.add(id);
      else next.delete(id);
      // Persist so the expanded/collapsed choice survives reopening the popup.
      void setPluginCollapsed(id, willCollapse);
      return next;
    });
  }, []);

  const mirrorEnabled = useCallback((id: string, enabled: boolean) => {
    setEnabledMap((previous) => ({ ...previous, [id]: enabled }));
  }, []);

  return {
    enabledMap,
    settingsMap,
    collapsed,
    handleSetting,
    handleImmediateSettings,
    toggleCollapsed,
    mirrorEnabled,
  };
}
