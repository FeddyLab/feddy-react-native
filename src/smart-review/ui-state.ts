export interface SmartReviewSheetState {
  visible: boolean;
  onLiked?: () => void;
  onDisliked?: () => void;
  onStoreConfirmed?: () => void;
  onStoreDismissed?: () => void;
  onSheetDismissedBeforeChoice?: () => void;
}

type Listener = (state: SmartReviewSheetState) => void;

export interface OpenArgs {
  onLiked: () => void;
  onDisliked: () => void;
  onStoreConfirmed: () => void;
  onStoreDismissed: () => void;
  onSheetDismissedBeforeChoice: () => void;
}

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

  open(args: OpenArgs): void {
    this.state = { visible: true, ...args };
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
