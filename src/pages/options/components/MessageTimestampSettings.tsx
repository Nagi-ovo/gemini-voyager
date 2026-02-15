import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';

const SETTINGS_KEY = 'gvMessageTimestampSettings';

interface TimestampSettings {
  enabled: boolean;
  use24Hour: boolean;
  showDate: boolean;
  showTime: boolean;
  dateFormat: string;
  customFormat: string;
  position: 'below' | 'above';
  backgroundColor: string;
  textColor: string;
  fontSize: string;
  borderRadius: string;
  showIndicator: boolean;
}

const DEFAULT_SETTINGS: TimestampSettings = {
  enabled: true,
  use24Hour: false,
  showDate: true,
  showTime: true,
  dateFormat: 'MM/DD/YY',
  customFormat: '',
  position: 'below',
  backgroundColor: '',
  textColor: '',
  fontSize: '12',
  borderRadius: '16',
  showIndicator: true,
};

const DATE_FORMATS = [
  { value: 'MM/DD/YY', label: '02/15/26 (US)' },
  { value: 'DD/MM/YY', label: '15/02/26 (EU)' },
  { value: 'YYYY-MM-DD', label: '2026-02-15 (ISO)' },
  { value: 'YYYY年MM月DD日', label: '2026年02月15日 (中文)' },
];

const POSITIONS = [
  { value: 'below', label: 'Below message' },
  { value: 'above', label: 'Above message' },
];

export function MessageTimestampSettings() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<TimestampSettings>(DEFAULT_SETTINGS);
  const [previewTime, setPreviewTime] = useState(new Date());

  // Load settings on mount
  useEffect(() => {
    chrome.storage?.sync?.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS }, (result) => {
      setSettings({ ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] });
    });
  }, []);

  // Save settings
  const saveSettings = (newSettings: TimestampSettings) => {
    setSettings(newSettings);
    chrome.storage?.sync?.set({ [SETTINGS_KEY]: newSettings });
  };

  // Update preview every second
  useEffect(() => {
    const interval = setInterval(() => setPreviewTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Format timestamp for preview
  const formatPreview = (date: Date): string => {
    const { use24Hour, showDate, showTime, dateFormat, customFormat } = settings;

    if (customFormat) {
      return formatWithTemplate(date, customFormat);
    }

    let result = '';

    if (showDate) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      switch (dateFormat) {
        case 'MM/DD/YY':
          result += `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
          break;
        case 'DD/MM/YY':
          result += `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
          break;
        case 'YYYY-MM-DD':
          result += `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          break;
        case 'YYYY年MM月DD日':
          result += `${year}年${month}月${day}日`;
          break;
      }
    }

    if (showTime) {
      if (result) result += ' ';
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');

      if (use24Hour) {
        result += `${hours.toString().padStart(2, '0')}:${minutes}`;
      } else {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        result += `${hours}:${minutes} ${ampm}`;
      }
    }

    return result || date.toLocaleString();
  };

  const formatWithTemplate = (date: Date, template: string): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;

    return template
      .replace(/{YYYY}/g, year.toString())
      .replace(/{YY}/g, year.toString().slice(-2))
      .replace(/{MM}/g, month.toString().padStart(2, '0'))
      .replace(/{M}/g, month.toString())
      .replace(/{DD}/g, day.toString().padStart(2, '0'))
      .replace(/{D}/g, day.toString())
      .replace(/{HH}/g, hours.toString().padStart(2, '0'))
      .replace(/{H}/g, hours.toString())
      .replace(/{hh}/g, hours12.toString().padStart(2, '0'))
      .replace(/{h}/g, hours12.toString())
      .replace(/{mm}/g, minutes.toString().padStart(2, '0'))
      .replace(/{A}/g, ampm)
      .replace(/{a}/g, ampm.toLowerCase());
  };

  const resetToDefaults = () => {
    saveSettings(DEFAULT_SETTINGS);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('messageTimestampTitle') || 'Message Timestamps'}</span>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              saveSettings({ ...settings, enabled: checked })
            }
          />
        </CardTitle>
      </CardHeader>

      {settings.enabled && (
        <CardContent className="space-y-6">
          {/* Preview */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <Label className="mb-2 block text-sm font-medium">Preview</Label>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
              style={{
                backgroundColor: settings.backgroundColor || 'rgba(66, 133, 244, 0.08)',
                color: settings.textColor || 'inherit',
                fontSize: `${settings.fontSize}px`,
                borderRadius: `${settings.borderRadius}px`,
              }}
            >
              {settings.showIndicator && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                  }}
                />
              )}
              {formatPreview(previewTime)}
            </div>
          </div>

          {/* Time Format */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Time Format</Label>

            <div className="flex items-center justify-between">
              <Label htmlFor="use24Hour" className="cursor-pointer">
                Use 24-hour format
              </Label>
              <Switch
                id="use24Hour"
                checked={settings.use24Hour}
                onCheckedChange={(checked) =>
                  saveSettings({ ...settings, use24Hour: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showDate" className="cursor-pointer">
                Show date
              </Label>
              <Switch
                id="showDate"
                checked={settings.showDate}
                onCheckedChange={(checked) =>
                  saveSettings({ ...settings, showDate: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showTime" className="cursor-pointer">
                Show time
              </Label>
              <Switch
                id="showTime"
                checked={settings.showTime}
                onCheckedChange={(checked) =>
                  saveSettings({ ...settings, showTime: checked })
                }
              />
            </div>

            {settings.showDate && (
              <div className="space-y-2">
                <Label htmlFor="dateFormat">Date format</Label>
                <select
                  id="dateFormat"
                  value={settings.dateFormat}
                  onChange={(e) =>
                    saveSettings({ ...settings, dateFormat: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {DATE_FORMATS.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="customFormat">Custom format (optional)</Label>
              <input
                id="customFormat"
                type="text"
                placeholder="e.g., {YYYY}-{MM}-{DD} {HH}:{mm}"
                value={settings.customFormat}
                onChange={(e) =>
                  saveSettings({ ...settings, customFormat: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Use placeholders: {'{YYYY}'}, {'{MM}'}, {'{DD}'}, {'{HH}'}, {'{mm}'}, {'{A}'}
              </p>
            </div>
          </div>

          {/* Appearance */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Appearance</Label>

            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <select
                id="position"
                value={settings.position}
                onChange={(e) =>
                  saveSettings({ ...settings, position: e.target.value as 'below' | 'above' })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos.value} value={pos.value}>
                    {pos.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showIndicator" className="cursor-pointer">
                Show status indicator dot
              </Label>
              <Switch
                id="showIndicator"
                checked={settings.showIndicator}
                onCheckedChange={(checked) =>
                  saveSettings({ ...settings, showIndicator: checked })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fontSize">Font size (px)</Label>
                <input
                  id="fontSize"
                  type="number"
                  min="8"
                  max="24"
                  value={settings.fontSize}
                  onChange={(e) =>
                    saveSettings({ ...settings, fontSize: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="borderRadius">Border radius (px)</Label>
                <input
                  id="borderRadius"
                  type="number"
                  min="0"
                  max="50"
                  value={settings.borderRadius}
                  onChange={(e) =>
                    saveSettings({ ...settings, borderRadius: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="backgroundColor">Background color</Label>
                <div className="flex gap-2">
                  <input
                    id="backgroundColor"
                    type="color"
                    value={settings.backgroundColor || '#4285f414'}
                    onChange={(e) =>
                      saveSettings({
                        ...settings,
                        backgroundColor: e.target.value,
                      })
                    }
                    className="h-10 w-14 p-1 rounded border"
                  />
                  <input
                    type="text"
                    value={settings.backgroundColor}
                    onChange={(e) =>
                      saveSettings({
                        ...settings,
                        backgroundColor: e.target.value,
                      })
                    }
                    placeholder="rgba(66, 133, 244, 0.08)"
                    className="flex-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="textColor">Text color</Label>
                <div className="flex gap-2">
                  <input
                    id="textColor"
                    type="color"
                    value={settings.textColor || '#5f6368'}
                    onChange={(e) =>
                      saveSettings({ ...settings, textColor: e.target.value })
                    }
                    className="h-10 w-14 p-1 rounded border"
                  />
                  <input
                    type="text"
                    value={settings.textColor}
                    onChange={(e) =>
                      saveSettings({ ...settings, textColor: e.target.value })
                    }
                    placeholder="#5f6368"
                    className="flex-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reset button */}
          <Button variant="outline" onClick={resetToDefaults} className="w-full">
            Reset to defaults
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
