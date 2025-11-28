/**
 * Formula Copy Service
 * Handles copying LaTeX/MathJax formulas from Gemini chat conversations
 * Uses enterprise patterns: Singleton, Service Layer, Event Delegation
 */

import browser from 'webextension-polyfill';

import { latexToUnicodeMath } from './UnicodeMathConverter';

import { logger } from '@/core';
import { StorageKeys } from '@/core/types/common';
import type { ILogger } from '@/core/types/common';

/**
 * Formula copy format options
 */
export type FormulaCopyFormat = 'latex' | 'unicodemath';

/**
 * Configuration for the formula copy service
 */
export interface FormulaCopyConfig {
  toastDuration?: number;
  toastOffsetY?: number;
  maxTraversalDepth?: number;
  format?: FormulaCopyFormat;
}

/**
 * Service class for handling formula copy functionality
 * Implements Singleton pattern for single instance management
 */
export class FormulaCopyService {
  private static instance: FormulaCopyService | null = null;
  private readonly logger: ILogger;
  private readonly config: Required<Omit<FormulaCopyConfig, 'format'>>;
  private currentFormat: FormulaCopyFormat = 'latex';

  // Storage change listener, extracted so it can be removed on destroy
  private readonly handleStorageChange: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, areaName) => {
    if (areaName === 'sync' && changes[StorageKeys.FORMULA_COPY_FORMAT]) {
      const newFormat = changes[StorageKeys.FORMULA_COPY_FORMAT]
        .newValue as FormulaCopyFormat;
      if (newFormat === 'latex' || newFormat === 'unicodemath') {
        this.currentFormat = newFormat;
        this.logger.debug('Formula format changed', { format: newFormat });
      }
    }
  };

  private isInitialized = false;
  private copyToast: HTMLDivElement | null = null;
  private i18nMessages: Record<string, string> = {};

  private constructor(config: FormulaCopyConfig = {}) {
    this.logger = logger.createChild('FormulaCopy');
    this.config = {
      toastDuration: config.toastDuration ?? 2000,
      toastOffsetY: config.toastOffsetY ?? 40,
      maxTraversalDepth: config.maxTraversalDepth ?? 10,
    };
    this.currentFormat = config.format ?? 'latex';
    this.loadI18nMessages();
    this.loadFormatPreference();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: FormulaCopyConfig): FormulaCopyService {
    if (!FormulaCopyService.instance) {
      FormulaCopyService.instance = new FormulaCopyService(config);
    }
    return FormulaCopyService.instance;
  }

  /**
   * Load i18n messages for toast notifications
   */
  private loadI18nMessages(): void {
    try {
      this.i18nMessages = {
        copied: browser.i18n.getMessage('formula_copied') || '✓ Formula copied',
        failed: browser.i18n.getMessage('formula_copy_failed') || '✗ Failed to copy',
      };
    } catch (error) {
      this.logger.warn('Failed to load i18n messages, using defaults', { error });
      this.i18nMessages = {
        copied: '✓ Formula copied',
        failed: '✗ Failed to copy',
      };
    }
  }

  /**
   * Load format preference from storage
   */
  private async loadFormatPreference(): Promise<void> {
    try {
      const result = await browser.storage.sync.get(StorageKeys.FORMULA_COPY_FORMAT);
      const format = result[StorageKeys.FORMULA_COPY_FORMAT] as FormulaCopyFormat | undefined;
      if (format === 'latex' || format === 'unicodemath') {
        this.currentFormat = format;
        this.logger.debug('Loaded formula format preference', { format });
      }
    } catch (error) {
      this.logger.warn('Failed to load format preference, using default', { error });
    }

    // Listen for format changes
    browser.storage.onChanged.addListener(this.handleStorageChange);
  }

  /**
   * Initialize the formula copy feature
   */
  public initialize(): void {
    if (this.isInitialized) {
      this.logger.warn('Service already initialized');
      return;
    }

    document.addEventListener('click', this.handleClick, true);
    this.isInitialized = true;
    this.logger.info('Formula copy service initialized');
  }

  /**
   * Clean up the service (for extension unloading)
   */
  public destroy(): void {
    // Always detach storage change listener
    try {
      browser.storage.onChanged.removeListener(this.handleStorageChange);
    } catch (error) {
      this.logger.warn('Failed to remove storage change listener', { error });
    }

    if (!this.isInitialized) {
      this.logger.warn('Service not initialized, cannot destroy');
      return;
    }

    document.removeEventListener('click', this.handleClick, true);
    this.removeCopyToast();
    this.isInitialized = false;
    this.logger.info('Formula copy service destroyed');
  }

  /**
   * Handle click events using event delegation
   */
  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const mathElement = this.findMathElement(target);

    if (!mathElement) {
      return;
    }

    const latexSource = mathElement.getAttribute('data-math');
    if (!latexSource) {
      this.logger.warn('Math element found but no data-math attribute');
      return;
    }

    // Wrap formula with delimiters based on display type
    const isDisplayMode = this.isDisplayMode(mathElement);
    const wrappedFormula = this.wrapFormula(latexSource, isDisplayMode);

    this.copyFormula(wrappedFormula, event.clientX, event.clientY);
    event.stopPropagation();
  };

  /**
   * Copy formula to clipboard and show notification
   */
  private async copyFormula(
    formula: string,
    x: number,
    y: number
  ): Promise<void> {
    try {
      const success = await this.copyToClipboard(formula);

      if (success) {
        this.showToast(this.i18nMessages.copied, x, y, true);
        this.logger.debug('Formula copied successfully', { length: formula.length });
      } else {
        this.showToast(this.i18nMessages.failed, x, y, false);
        this.logger.error('Failed to copy formula');
      }
    } catch (error) {
      this.showToast(this.i18nMessages.failed, x, y, false);
      this.logger.error('Error copying formula', { error });
    }
  }

  /**
   * Copy text to clipboard using modern API with fallback
   */
  private async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      // Fallback to execCommand for older browsers
      return this.copyToClipboardLegacy(text);
    } catch (error) {
      this.logger.error('Clipboard API failed, trying fallback', { error });
      return this.copyToClipboardLegacy(text);
    }
  }

  /**
   * Legacy clipboard copy method using execCommand
   */
  private copyToClipboardLegacy(text: string): boolean {
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
      this.logger.error('Legacy clipboard copy failed', { error });
      return false;
    }
  }

  /**
   * Find the nearest math element in the DOM tree
   */
  private findMathElement(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;
    let depth = 0;

    while (current && depth < this.config.maxTraversalDepth) {
      // Direct data-math attribute check
      if (current.hasAttribute('data-math')) {
        return current;
      }

      // Check if element is a math container
      if (this.isMathContainer(current)) {
        const mathElement = this.findDataMathInSubtree(current, depth);
        if (mathElement) {
          return mathElement;
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Check if element is a math container
   */
  private isMathContainer(element: HTMLElement): boolean {
    return (
      element.classList.contains('math-inline') ||
      element.classList.contains('math-block')
    );
  }

  /**
   * Check if formula is in display mode (block formula)
   */
  private isDisplayMode(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    let depth = 0;

    // Traverse up to find display mode indicator
    while (current && depth < this.config.maxTraversalDepth) {
      if (current.classList.contains('math-block')) {
        return true;
      }
      current = current.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * Wrap formula with appropriate delimiters based on format
   * @param formula - Raw LaTeX formula
   * @param isDisplayMode - Whether formula is in display mode
   * @returns Formatted formula (LaTeX with delimiters or UnicodeMath)
   */
  private wrapFormula(formula: string, isDisplayMode: boolean): string {
    if (this.currentFormat === 'unicodemath') {
      // Convert to UnicodeMath format for Word
      return latexToUnicodeMath(formula);
    }

    // Default: LaTeX format with delimiters
    if (isDisplayMode) {
      return `$$${formula}$$`;
    }
    return `$${formula}$`;
  }

  /**
   * Search for data-math attribute in element subtree
   */
  private findDataMathInSubtree(
    root: HTMLElement,
    currentDepth: number
  ): HTMLElement | null {
    let searchElement: HTMLElement | null = root;
    let depth = currentDepth;

    while (searchElement && depth < this.config.maxTraversalDepth) {
      if (searchElement.hasAttribute('data-math')) {
        return searchElement;
      }
      searchElement = searchElement.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Show toast notification
   */
  private showToast(
    message: string,
    x: number,
    y: number,
    isSuccess: boolean
  ): void {
    if (!this.copyToast) {
      this.copyToast = this.createCopyToast();
    }

    this.copyToast.textContent = message;
    this.copyToast.style.left = `${x}px`;
    this.copyToast.style.top = `${y - this.config.toastOffsetY}px`;

    // Update toast style based on success/failure
    if (isSuccess) {
      this.copyToast.classList.remove('gv-copy-toast-error');
      this.copyToast.classList.add('gv-copy-toast-success');
    } else {
      this.copyToast.classList.remove('gv-copy-toast-success');
      this.copyToast.classList.add('gv-copy-toast-error');
    }

    this.copyToast.classList.add('gv-copy-toast-show');

    setTimeout(() => {
      this.copyToast?.classList.remove('gv-copy-toast-show');
    }, this.config.toastDuration);
  }

  /**
   * Create toast element
   */
  private createCopyToast(): HTMLDivElement {
    const toast = document.createElement('div');
    toast.className = 'gv-copy-toast';
    document.body.appendChild(toast);
    return toast;
  }

  /**
   * Remove toast element from DOM
   */
  private removeCopyToast(): void {
    if (this.copyToast?.parentElement) {
      this.copyToast.parentElement.removeChild(this.copyToast);
      this.copyToast = null;
    }
  }

  /**
   * Check if service is initialized
   */
  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance getter
export const getFormulaCopyService = (config?: FormulaCopyConfig) =>
  FormulaCopyService.getInstance(config);
