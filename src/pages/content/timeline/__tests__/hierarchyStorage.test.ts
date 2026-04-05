import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';

import {
  filterTimelineHierarchyByRouteScope,
  getTimelineHierarchyStorageKey,
  resolveTimelineHierarchyDataForStorageScope,
} from '../hierarchyStorage';

describe('timeline hierarchy storage helpers', () => {
  it('builds an account-scoped storage key', () => {
    expect(getTimelineHierarchyStorageKey('email:abc123')).toBe(
      `${StorageKeys.TIMELINE_HIERARCHY}:acct:${hashString('email:abc123')}`,
    );
  });

  it('falls back to filtered legacy hierarchy data when scoped storage is missing', () => {
    const result = resolveTimelineHierarchyDataForStorageScope(
      {
        [StorageKeys.TIMELINE_HIERARCHY]: {
          conversations: {
            'gemini:conv:u1': {
              conversationUrl: 'https://gemini.google.com/u/1/app/u1',
              levels: { 'turn-1': 2 },
              collapsed: [],
              updatedAt: 1,
            },
            'gemini:conv:u2': {
              conversationUrl: 'https://gemini.google.com/u/2/app/u2',
              levels: { 'turn-2': 3 },
              collapsed: ['turn-3'],
              updatedAt: 2,
            },
          },
        },
      },
      'email:test',
      '2',
    );

    expect(result).toEqual({
      conversations: {
        'gemini:conv:u2': {
          conversationUrl: 'https://gemini.google.com/u/2/app/u2',
          levels: { 'turn-2': 3 },
          collapsed: ['turn-3'],
          updatedAt: 2,
        },
      },
    });
  });

  it('prefers the scoped storage key even when it is explicitly empty', () => {
    const scopedKey = getTimelineHierarchyStorageKey('email:test');
    const result = resolveTimelineHierarchyDataForStorageScope(
      {
        [scopedKey]: { conversations: {} },
        [StorageKeys.TIMELINE_HIERARCHY]: {
          conversations: {
            'gemini:conv:legacy': {
              conversationUrl: 'https://gemini.google.com/u/1/app/legacy',
              levels: { 'turn-1': 2 },
              collapsed: [],
              updatedAt: 1,
            },
          },
        },
      },
      'email:test',
      '1',
    );

    expect(result).toEqual({ conversations: {} });
  });

  it('filters hierarchy conversations by route user id', () => {
    expect(
      filterTimelineHierarchyByRouteScope(
        {
          conversations: {
            'gemini:conv:u1': {
              conversationUrl: 'https://gemini.google.com/u/1/app/u1',
              levels: { 'turn-1': 2 },
              collapsed: [],
              updatedAt: 1,
            },
            'gemini:conv:shared': {
              conversationUrl: 'https://gemini.google.com/app/shared',
              levels: { 'turn-2': 3 },
              collapsed: [],
              updatedAt: 2,
            },
          },
        },
        '1',
      ),
    ).toEqual({
      conversations: {
        'gemini:conv:u1': {
          conversationUrl: 'https://gemini.google.com/u/1/app/u1',
          levels: { 'turn-1': 2 },
          collapsed: [],
          updatedAt: 1,
        },
        'gemini:conv:shared': {
          conversationUrl: 'https://gemini.google.com/app/shared',
          levels: { 'turn-2': 3 },
          collapsed: [],
          updatedAt: 2,
        },
      },
    });
  });
});
