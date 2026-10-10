import { createToaster } from '@/core/ui/toast/toaster';

import { AUTO_APPLY_FAILURE_CHANNEL, DefaultModelAutoApply } from './autoApply';
import { DefaultStars } from './defaultStars';
import { ModelPicker } from './modelPicker';
import { DefaultModelPreferences } from './preferences';
import './styles.css';

class DefaultModelManager {
  private static instance: DefaultModelManager;
  private readonly preferences = new DefaultModelPreferences();
  private readonly picker = new ModelPicker(this.preferences);
  private readonly toaster = createToaster();
  private readonly stars = new DefaultStars(this.preferences, this.picker, this.toaster);
  private readonly autoApply = new DefaultModelAutoApply(
    this.preferences,
    this.picker,
    this.toaster,
  );
  private stopPreferenceWatch: (() => void) | null = null;
  private started = false;

  private constructor() {}

  public static getInstance(): DefaultModelManager {
    if (!DefaultModelManager.instance) {
      DefaultModelManager.instance = new DefaultModelManager();
    }
    return DefaultModelManager.instance;
  }

  public async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.preferences.load();
    this.stopPreferenceWatch = this.preferences.watchAutoApply((enabled) => {
      this.autoApply.setEnabled(enabled);
      if (enabled) return;
      this.stars.sweep();
      this.toaster.dismiss(AUTO_APPLY_FAILURE_CHANNEL);
    });
    this.stars.start();
    this.autoApply.start();
  }

  public destroy(): void {
    if (!this.started) return;
    this.started = false;
    this.stars.stop();
    this.autoApply.stop();
    this.toaster.clear();
    this.stopPreferenceWatch?.();
    this.stopPreferenceWatch = null;
  }
}

export default DefaultModelManager;
