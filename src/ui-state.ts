import type { OpenFeedbackOptions } from './types';

export interface ComposeUIState {
  visible: boolean;
  boardKey?: string;
}

type Listener = (state: ComposeUIState) => void;

class UIStateStore {
  private state: ComposeUIState = { visible: false };
  private listeners = new Set<Listener>();

  getState(): ComposeUIState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  open(opts?: OpenFeedbackOptions): void {
    this.state = { visible: true, boardKey: opts?.boardKey };
    this.emit();
  }

  close(): void {
    this.state = { visible: false };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const uiState = new UIStateStore();
