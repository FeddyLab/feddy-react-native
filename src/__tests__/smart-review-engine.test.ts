import { describe, expect, it, vi } from 'vitest';

// engine.ts pulls a constant from store.ts which imports AsyncStorage —
// mock to avoid the native-module load in the test runner.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}));

import { DEFAULT_RULES, evaluate } from '../smart-review/engine';
import type { SmartReviewState } from '../smart-review/store';
import { YEARLY_WINDOW_MS } from '../smart-review/store';

const NOW = Date.UTC(2026, 5, 1); // 2026-06-01

const baseState = (
  overrides: Partial<SmartReviewState> = {}
): SmartReviewState => ({
  installDate: NOW - 100 * 86_400_000,
  sessionCount: 10,
  lastShownAt: null,
  yearlyCount: 0,
  yearlyWindowStart: null,
  ...overrides,
});

describe('SmartReviewEngine.evaluate — gates', () => {
  it('shows when all gates pass', () => {
    expect(evaluate(NOW, baseState(), DEFAULT_RULES)).toEqual({ kind: 'show' });
  });

  it('skips when install age below threshold', () => {
    const r = evaluate(
      NOW,
      baseState({ installDate: NOW - 3 * 86_400_000 }),
      DEFAULT_RULES
    );
    expect(r).toEqual({
      kind: 'skip_below_install_age',
      observed: 3,
      required: 7,
    });
  });

  it('treats null installDate as 0 days', () => {
    const r = evaluate(NOW, baseState({ installDate: null }), DEFAULT_RULES);
    expect(r.kind).toBe('skip_below_install_age');
  });

  it('skips when session count below threshold', () => {
    const r = evaluate(NOW, baseState({ sessionCount: 2 }), DEFAULT_RULES);
    expect(r).toEqual({
      kind: 'skip_below_sessions',
      observed: 2,
      required: 5,
    });
  });

  it('skips during cooldown', () => {
    const r = evaluate(
      NOW,
      baseState({ lastShownAt: NOW - 30 * 86_400_000 }),
      DEFAULT_RULES
    );
    expect(r).toEqual({
      kind: 'skip_in_cooldown',
      observedDays: 30,
      requiredDays: 90,
    });
  });

  it('passes cooldown gate after threshold', () => {
    const r = evaluate(
      NOW,
      baseState({ lastShownAt: NOW - 100 * 86_400_000 }),
      DEFAULT_RULES
    );
    expect(r.kind).toBe('show');
  });

  it('skips when yearly cap reached within active window', () => {
    const r = evaluate(
      NOW,
      baseState({
        yearlyCount: 3,
        yearlyWindowStart: NOW - 10 * 86_400_000,
        // also push lastShownAt outside cooldown so we test yearly gate isolation
        lastShownAt: NOW - 100 * 86_400_000,
      }),
      DEFAULT_RULES
    );
    expect(r).toEqual({
      kind: 'skip_yearly_cap',
      observed: 3,
      cap: 3,
    });
  });

  it('passes yearly gate after window elapsed', () => {
    const r = evaluate(
      NOW,
      baseState({
        yearlyCount: 3,
        // window started > 365 days ago
        yearlyWindowStart: NOW - YEARLY_WINDOW_MS - 1,
        lastShownAt: NOW - 100 * 86_400_000,
      }),
      DEFAULT_RULES
    );
    expect(r.kind).toBe('show');
  });

  it('respects custom rules', () => {
    const r = evaluate(NOW, baseState({ sessionCount: 1 }), {
      minDaysSinceInstall: 1,
      minSessions: 1,
      cooldownDays: 30,
      yearlyCap: 1,
    });
    expect(r.kind).toBe('show');
  });

  it('floors fractional days (just-under-7d-install fails)', () => {
    const r = evaluate(
      NOW,
      baseState({ installDate: NOW - 6 * 86_400_000 - 1000 }),
      DEFAULT_RULES
    );
    // 6 days, 23h, 59m, 59s → still 6 whole days
    expect(r).toEqual({
      kind: 'skip_below_install_age',
      observed: 6,
      required: 7,
    });
  });
});
