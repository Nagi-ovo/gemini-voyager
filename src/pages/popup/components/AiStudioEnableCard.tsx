import type { CSSProperties } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { TranslationKey } from '@/utils/translations';

/** AI Studio's master switch, shown only while the popup is open on AI Studio. */
export function AiStudioEnableCard({
  checked,
  onChange,
  style,
  t,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  style?: CSSProperties;
  t: (key: TranslationKey) => string;
}) {
  return (
    <Card style={style} className="p-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Label
              htmlFor="aistudio-enabled"
              className="cursor-pointer text-sm leading-5 font-medium"
            >
              {t('enableOnAIStudio')}
            </Label>
            <p className="text-muted-foreground mt-1 text-xs">{t('enableOnAIStudioHint')}</p>
          </div>
          <Switch
            id="aistudio-enabled"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
