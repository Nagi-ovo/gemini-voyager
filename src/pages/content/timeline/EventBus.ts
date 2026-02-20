/**
 * Simple Event Bus implementation using Observer pattern
 * Provides type-safe event communication between components
 */

export type EventCallback<T = unknown> = (data: T) => void;

interface EventMap {
  'starred:added': { conversationId: string; turnId: string };
  'starred:removed': { conversationId: string; turnId: string };
  'starred:updated': { conversationId: string };
}

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  private constructor() {}

  /**
   * Singleton pattern: Get EventBus instance
   */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as EventCallback<unknown>);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Clear all listeners (useful for cleanup)
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get listener count for debugging
   */
  getListenerCount(event?: keyof EventMap): number {
    if (event) {
      return this.listeners.get(event)?.size || 0;
    }
    let total = 0;
    this.listeners.forEach((callbacks) => {
      total += callbacks.size;
    });
    return total;
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
