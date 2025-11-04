/**
 * TimelineStateManager unit tests
 * Demonstrates testing state management
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { TimelineStateManager } from '../TimelineStateManager';

import type { TurnId } from '@/core';

describe('TimelineStateManager', () => {
  let stateManager: TimelineStateManager;

  beforeEach(() => {
    stateManager = new TimelineStateManager();
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const config = stateManager.getConfig();

      expect(config.scrollMode).toBe('flow');
      expect(config.hideContainer).toBe(false);
      expect(config.draggable).toBe(false);
      expect(config.flowDuration).toBe(650);
    });

    it('should update config', () => {
      stateManager.updateConfig({ scrollMode: 'jump', flowDuration: 500 });

      const config = stateManager.getConfig();

      expect(config.scrollMode).toBe('jump');
      expect(config.flowDuration).toBe(500);
    });
  });

  describe('Markers', () => {
    it('should start with empty markers', () => {
      expect(stateManager.getMarkerCount()).toBe(0);
      expect(stateManager.getMarkers()).toEqual([]);
    });

    it('should set and get markers', () => {
      const markers = [
        {
          id: 'turn-1' as TurnId,
          element: document.createElement('div'),
          summary: 'Test turn',
          n: 0.5,
          baseN: 0.5,
          dotElement: null,
          starred: false,
        },
      ];

      stateManager.setMarkers(markers);

      expect(stateManager.getMarkerCount()).toBe(1);
      expect(stateManager.getMarkers()).toEqual(markers);
    });
  });

  describe('Active Turn', () => {
    it('should start with no active turn', () => {
      expect(stateManager.getActiveTurnId()).toBeNull();
    });

    it('should set and get active turn', () => {
      const turnId = 'turn-1' as TurnId;

      stateManager.setActiveTurnId(turnId);

      expect(stateManager.getActiveTurnId()).toBe(turnId);
    });
  });

  describe('Starred Conversations', () => {
    it('should start with no starred conversations', () => {
      expect(stateManager.getStarredTurnIds()).toEqual([]);
    });

    it('should toggle star on', () => {
      const turnId = 'turn-1' as TurnId;

      const isStarred = stateManager.toggleStar(turnId);

      expect(isStarred).toBe(true);
      expect(stateManager.isStarred(turnId)).toBe(true);
    });

    it('should toggle star off', () => {
      const turnId = 'turn-1' as TurnId;

      stateManager.toggleStar(turnId); // Star on
      const isStarred = stateManager.toggleStar(turnId); // Star off

      expect(isStarred).toBe(false);
      expect(stateManager.isStarred(turnId)).toBe(false);
    });

    it('should set multiple starred turns', () => {
      const turnIds = ['turn-1', 'turn-2', 'turn-3'] as TurnId[];

      stateManager.setStarred(turnIds);

      expect(stateManager.getStarredTurnIds()).toEqual(turnIds);
      turnIds.forEach((id) => {
        expect(stateManager.isStarred(id)).toBe(true);
      });
    });
  });

  describe('Cleanup', () => {
    it('should reset state on cleanup', () => {
      // Setup some state
      stateManager.updateConfig({ scrollMode: 'jump' });
      stateManager.setActiveTurnId('turn-1' as TurnId);
      stateManager.toggleStar('turn-1' as TurnId);

      // Cleanup
      stateManager.cleanup();

      // Verify reset
      const config = stateManager.getConfig();
      expect(config.scrollMode).toBe('flow'); // Default
      expect(stateManager.getActiveTurnId()).toBeNull();
      expect(stateManager.getStarredTurnIds()).toEqual([]);
    });
  });
});
