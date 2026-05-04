export interface SmartReviewSheetState {
  visible: boolean;
  onRated?: (stars: number) => void;
  onCancel?: () => void;
}

type Listener = (state: SmartReviewSheetState) => void;

class SmartReviewUIStateStore {
  private state: SmartReviewSheetState = { visible: false };
  private listeners = new Set<Listener>();

  getState(): SmartReviewSheetState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  open(args: { onRated: (stars: number) => void; onCancel: () => void }): void {
    this.state = {
      visible: true,
      onRated: args.onRated,
      onCancel: args.onCancel,
    };
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

export const smartReviewUIState = new SmartReviewUIStateStore();
