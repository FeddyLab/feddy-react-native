import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uiState } from '../ui-state';

describe('uiState', () => {
  beforeEach(() => {
    uiState.close();
  });

  it('starts hidden', () => {
    expect(uiState.getState().visible).toBe(false);
  });

  it('open() sets visible=true and stores boardKey', () => {
    uiState.open({ boardKey: 'features' });
    expect(uiState.getState()).toEqual({ visible: true, boardKey: 'features' });
  });

  it('open() with no opts leaves boardKey undefined', () => {
    uiState.open();
    expect(uiState.getState()).toEqual({ visible: true });
  });

  it('close() resets to hidden and drops boardKey', () => {
    uiState.open({ boardKey: 'bugs' });
    uiState.close();
    expect(uiState.getState()).toEqual({ visible: false });
  });

  it('subscribe() fires on every transition with the new state', () => {
    const listener = vi.fn();
    const unsubscribe = uiState.subscribe(listener);
    uiState.open({ boardKey: 'features' });
    uiState.close();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      visible: true,
      boardKey: 'features',
    });
    expect(listener).toHaveBeenNthCalledWith(2, { visible: false });
    unsubscribe();
  });

  it('unsubscribe stops further notifications', () => {
    const listener = vi.fn();
    const unsubscribe = uiState.subscribe(listener);
    unsubscribe();
    uiState.open();
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners each receive every event', () => {
    const a = vi.fn();
    const b = vi.fn();
    uiState.subscribe(a);
    uiState.subscribe(b);
    uiState.open();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
