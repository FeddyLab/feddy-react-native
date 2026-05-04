import { describe, expect, it } from 'vitest';
import { validateApiKey } from '../api-key';

describe('validateApiKey', () => {
  it('accepts a well-formed Project ID (fed_ + 12 alphanumeric)', () => {
    const res = validateApiKey('fed_abc123def456');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('fed_abc123def456');
  });

  it('trims surrounding whitespace before validation', () => {
    const res = validateApiKey('  fed_abc123def456\n');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('fed_abc123def456');
  });

  it('rejects empty input', () => {
    expect(validateApiKey('').ok).toBe(false);
    expect(validateApiKey('   ').ok).toBe(false);
  });

  it('rejects fed_sk_* server keys with a clear message', () => {
    const res = validateApiKey('fed_sk_abc123def456');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/Server API keys/i);
    }
  });

  it('rejects deprecated fed_pk_* form', () => {
    expect(validateApiKey('fed_pk_abc123def456').ok).toBe(false);
  });

  it('rejects wrong body length', () => {
    expect(validateApiKey('fed_abc123def45').ok).toBe(false);
    expect(validateApiKey('fed_abc123def4567').ok).toBe(false);
  });

  it('rejects non-alphanumeric body', () => {
    expect(validateApiKey('fed_abc-123def4').ok).toBe(false);
    expect(validateApiKey('fed_abc 123def4').ok).toBe(false);
  });

  it('rejects missing fed_ prefix', () => {
    expect(validateApiKey('abc123def4567').ok).toBe(false);
  });
});
