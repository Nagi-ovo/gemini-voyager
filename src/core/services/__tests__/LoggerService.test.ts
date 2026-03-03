/**
 * LoggerService unit tests
 * Covers: singleton pattern, log level filtering, setLevel/getLevel, createChild
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogLevel, LoggerService } from '../LoggerService';

function resetSingleton() {
  (LoggerService as unknown as { instance: null }).instance = null;
}

describe('LoggerService', () => {
  beforeEach(() => {
    resetSingleton();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSingleton();
  });

  describe('singleton pattern', () => {
    it('should return the same instance on multiple calls to getInstance()', () => {
      const a = LoggerService.getInstance();
      const b = LoggerService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('setLevel / getLevel', () => {
    it('should return the level that was set', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should update getLevel after multiple setLevel calls', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('log level filtering', () => {
    it('should call console.debug when level is DEBUG and debug() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('hello debug');
      expect(console.debug).toHaveBeenCalledOnce();
    });

    it('should NOT call console.debug when level is INFO and debug() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.INFO);
      logger.debug('suppressed debug');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should NOT call console.info when level is WARN and info() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.WARN);
      logger.info('suppressed info');
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should call console.warn when level is WARN and warn() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.WARN);
      logger.warn('visible warning');
      expect(console.warn).toHaveBeenCalledOnce();
    });

    it('should call console.error when level is ERROR and error() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.ERROR);
      logger.error('an error occurred');
      expect(console.error).toHaveBeenCalledOnce();
    });

    it('should NOT call console.warn when level is ERROR and warn() is called', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.ERROR);
      logger.warn('suppressed warn');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should suppress all output when level is NONE', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.NONE);
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('no');
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('createChild', () => {
    it('should include the prefix string in console.debug output', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.DEBUG);
      const child = logger.createChild('MyComponent');
      child.debug('test message');
      expect(console.debug).toHaveBeenCalledOnce();
      const firstArg = (console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(firstArg).toContain('MyComponent');
    });

    it('should support chaining createChild calls without throwing', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.DEBUG);
      expect(() => {
        const child = logger.createChild('FeatureA');
        const grandchild = child.createChild('SubModule');
        grandchild.debug('nested log');
      }).not.toThrow();
    });

    it('should include both parent and child prefix in nested createChild output', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.DEBUG);
      const child = logger.createChild('ParentFeature');
      const grandchild = child.createChild('ChildModule');
      grandchild.info('deep message');
      expect(console.info).toHaveBeenCalledOnce();
      const firstArg = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(firstArg).toContain('ParentFeature');
      expect(firstArg).toContain('ChildModule');
    });

    it('should not affect the parent logger level when child logs', () => {
      const logger = LoggerService.getInstance();
      logger.setLevel(LogLevel.WARN);
      const child = logger.createChild('SomeModule');
      // child inherits parent config (WARN), so debug should be suppressed
      child.debug('should be suppressed');
      expect(console.debug).not.toHaveBeenCalled();
    });
  });
});
