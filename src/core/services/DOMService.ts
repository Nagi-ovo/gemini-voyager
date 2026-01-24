/**
 * DOM manipulation service
 * Centralizes DOM queries and mutations with error handling
 */
import { DOMError, ErrorCode } from '../errors/AppError';
import type { Nullable, Result } from '../types/common';
import { logger } from './LoggerService';

export interface WaitForElementOptions {
  timeout?: number;
  checkInterval?: number;
  rootElement?: Element;
}

export class DOMService {
  private readonly logger = logger.createChild('DOM');
  private observers: Map<string, MutationObserver> = new Map();

  /**
   * Wait for an element to appear in the DOM
   */
  async waitForElement(
    selector: string,
    options: WaitForElementOptions = {},
  ): Promise<Result<HTMLElement>> {
    const { timeout = 5000, rootElement = document.body } = options;

    this.logger.debug(`Waiting for element: ${selector}`);

    return new Promise((resolve) => {
      // Check if element already exists
      const existing = rootElement.querySelector(selector);
      if (existing) {
        this.logger.debug(`Element found immediately: ${selector}`);
        resolve({ success: true, data: existing as HTMLElement });
        return;
      }

      let timeoutId: number | null = null;
      const observer = new MutationObserver(() => {
        const element = rootElement.querySelector(selector);
        if (element) {
          this.logger.debug(`Element found: ${selector}`);

          observer.disconnect();
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }

          resolve({ success: true, data: element as HTMLElement });
        }
      });

      observer.observe(rootElement, {
        childList: true,
        subtree: true,
      });

      // Set timeout
      if (timeout > 0) {
        timeoutId = window.setTimeout(() => {
          this.logger.warn(`Element not found within timeout: ${selector}`);

          observer.disconnect();
          resolve({
            success: false,
            error: new DOMError(ErrorCode.ELEMENT_NOT_FOUND, `Element not found: ${selector}`, {
              selector,
              timeout,
            }),
          });
        }, timeout);
      }
    });
  }

  /**
   * Safe query selector
   */
  querySelector<T extends HTMLElement = HTMLElement>(
    selector: string,
    root: Element | Document = document,
  ): Result<T> {
    try {
      const element = root.querySelector(selector);

      if (!element) {
        this.logger.debug(`Element not found: ${selector}`);
        return {
          success: false,
          error: new DOMError(ErrorCode.ELEMENT_NOT_FOUND, `Element not found: ${selector}`, {
            selector,
          }),
        };
      }

      return { success: true, data: element as T };
    } catch (error) {
      this.logger.error(`Query failed: ${selector}`, { error });
      return {
        success: false,
        error: new DOMError(
          ErrorCode.ELEMENT_QUERY_FAILED,
          `Query failed: ${selector}`,
          { selector },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Safe query selector all
   */
  querySelectorAll<T extends HTMLElement = HTMLElement>(
    selector: string,
    root: Element | Document = document,
  ): Result<T[]> {
    try {
      const elements = Array.from(root.querySelectorAll(selector)) as T[];

      this.logger.debug(`Found ${elements.length} elements for: ${selector}`);

      return { success: true, data: elements };
    } catch (error) {
      this.logger.error(`Query failed: ${selector}`, { error });
      return {
        success: false,
        error: new DOMError(
          ErrorCode.ELEMENT_QUERY_FAILED,
          `Query failed: ${selector}`,
          { selector },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Create element with attributes
   */
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attributes?: Partial<Record<string, string>>,
    children?: (HTMLElement | string)[],
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);

    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined) {
          element.setAttribute(key, value);
        }
      });
    }

    if (children) {
      children.forEach((child) => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      });
    }

    return element;
  }

  /**
   * Create observer for element changes
   */
  observeElement(
    element: Element,
    callback: MutationCallback,
    options: MutationObserverInit = { childList: true, subtree: true },
  ): string {
    const observerId = `observer-${Date.now()}-${Math.random()}`;

    const observer = new MutationObserver(callback);
    observer.observe(element, options);

    this.observers.set(observerId, observer);

    this.logger.debug(`Created observer: ${observerId}`);

    return observerId;
  }

  /**
   * Disconnect an observer
   */
  disconnectObserver(observerId: string): void {
    const observer = this.observers.get(observerId);

    if (observer) {
      observer.disconnect();
      this.observers.delete(observerId);
      this.logger.debug(`Disconnected observer: ${observerId}`);
    }
  }

  /**
   * Disconnect all observers
   */
  disconnectAllObservers(): void {
    this.logger.debug(`Disconnecting ${this.observers.size} observers`);

    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }

  /**
   * Get computed style value
   */
  getComputedStyleValue(element: Element, property: string): string {
    return getComputedStyle(element).getPropertyValue(property);
  }

  /**
   * Check if element matches selector
   */
  matches(element: Element, selector: string): boolean {
    return element.matches(selector);
  }

  /**
   * Find closest ancestor matching selector
   */
  closest<T extends HTMLElement = HTMLElement>(element: Element, selector: string): Nullable<T> {
    return element.closest(selector) as Nullable<T>;
  }
}

// Export singleton instance
export const domService = new DOMService();
