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
    <Card style={style} className="border-primary/20 p-4 transition-all hover:shadow-md">
      <CardContent className="p-0">
        <div className="group flex items-center justify-between">
          <div className="flex-1">
            <Label
              htmlFor="aistudio-enabled"
              className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
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
