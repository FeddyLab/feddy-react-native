import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  installDate: 'app.feddy.smartReview.installDate',
  sessionCount: 'app.feddy.smartReview.sessionCount',
  lastShownAt: 'app.feddy.smartReview.lastShownAt',
  yearlyCount: 'app.feddy.smartReview.yearlyCount',
  yearlyWindowStart: 'app.feddy.smartReview.yearlyWindowStart',
} as const;

/** Seconds in 365 days. Not a calendar year so leap-year drift can't
 * turn a 4th prompt into "365 days minus a few hours" by accident. */
export const YEARLY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export interface SmartReviewState {
  installDate: number | null; // ms epoch
  sessionCount: number;
  lastShownAt: number | null; // ms epoch
  yearlyCount: number;
  yearlyWindowStart: number | null; // ms epoch
}

async function getInt(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

async function getMs(key: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Read all five fields in parallel. */
export async function snapshot(): Promise<SmartReviewState> {
  const [
    installDate,
    sessionCount,
    lastShownAt,
    yearlyCount,
    yearlyWindowStart,
  ] = await Promise.all([
    getMs(KEYS.installDate),
    getInt(KEYS.sessionCount),
    getMs(KEYS.lastShownAt),
    getInt(KEYS.yearlyCount),
    getMs(KEYS.yearlyWindowStart),
  ]);
  return {
    installDate,
    sessionCount,
    lastShownAt,
    yearlyCount,
    yearlyWindowStart,
  };
}

/**
 * Record one session. Lazily writes installDate on first call so a
 * fresh integration starts the gating clock from today rather than
 * from app install (which on a long-shipped app could already be
 * years past minDaysSinceInstall).
 */
export async function bumpSession(now: number = Date.now()): Promise<void> {
  const existingInstall = await AsyncStorage.getItem(KEYS.installDate);
  if (existingInstall == null) {
    await AsyncStorage.setItem(KEYS.installDate, String(now));
  }
  const next = (await getInt(KEYS.sessionCount)) + 1;
  await AsyncStorage.setItem(KEYS.sessionCount, String(next));
}

/**
 * Record that the prompt was actually shown. Updates lastShownAt,
 * increments the yearly counter, and rolls the 365-day window over
 * when it has fully elapsed.
 */
export async function markShown(now: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastShownAt, String(now));
  const windowStart = await getMs(KEYS.yearlyWindowStart);
  if (windowStart != null && now - windowStart < YEARLY_WINDOW_MS) {
    const next = (await getInt(KEYS.yearlyCount)) + 1;
    await AsyncStorage.setItem(KEYS.yearlyCount, String(next));
  } else {
    await AsyncStorage.setItem(KEYS.yearlyWindowStart, String(now));
    await AsyncStorage.setItem(KEYS.yearlyCount, '1');
  }
}

/** Wipe every key — debug menus only. */
export async function clearAll(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => AsyncStorage.removeItem(k)));
}
