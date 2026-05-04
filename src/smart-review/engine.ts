import { type SmartReviewState, YEARLY_WINDOW_MS } from './store';

/**
 * Threshold bundle the rule engine evaluates against. Defaults match
 * the server's hard-coded baseline (7/5/90/3) — overridden by the
 * config fetcher when the workspace has a custom rule.
 */
export interface SmartReviewRules {
  minDaysSinceInstall: number;
  minSessions: number;
  cooldownDays: number;
  yearlyCap: number;
}

export const DEFAULT_RULES: SmartReviewRules = {
  minDaysSinceInstall: 7,
  minSessions: 5,
  cooldownDays: 90,
  yearlyCap: 3,
};

export type SmartReviewDecision =
  | { kind: 'show' }
  | { kind: 'skip_below_install_age'; observed: number; required: number }
  | { kind: 'skip_below_sessions'; observed: number; required: number }
  | { kind: 'skip_in_cooldown'; observedDays: number; requiredDays: number }
  | { kind: 'skip_yearly_cap'; observed: number; cap: number };

const MS_PER_DAY = 86_400_000;

function wholeDays(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / MS_PER_DAY);
}

/**
 * Pure decision: given a clock value, the persisted state, and a rules
 * bundle, decide whether to show the Smart Review prompt. No side
 * effects, trivially unit-testable.
 */
export function evaluate(
  now: number,
  state: SmartReviewState,
  rules: SmartReviewRules
): SmartReviewDecision {
  const daysSinceInstall =
    state.installDate != null ? wholeDays(state.installDate, now) : 0;
  if (daysSinceInstall < rules.minDaysSinceInstall) {
    return {
      kind: 'skip_below_install_age',
      observed: daysSinceInstall,
      required: rules.minDaysSinceInstall,
    };
  }

  if (state.sessionCount < rules.minSessions) {
    return {
      kind: 'skip_below_sessions',
      observed: state.sessionCount,
      required: rules.minSessions,
    };
  }

  if (state.lastShownAt != null) {
    const daysSinceLast = wholeDays(state.lastShownAt, now);
    if (daysSinceLast < rules.cooldownDays) {
      return {
        kind: 'skip_in_cooldown',
        observedDays: daysSinceLast,
        requiredDays: rules.cooldownDays,
      };
    }
  }

  if (
    state.yearlyWindowStart != null &&
    now - state.yearlyWindowStart < YEARLY_WINDOW_MS &&
    state.yearlyCount >= rules.yearlyCap
  ) {
    return {
      kind: 'skip_yearly_cap',
      observed: state.yearlyCount,
      cap: rules.yearlyCap,
    };
  }

  return { kind: 'show' };
}
