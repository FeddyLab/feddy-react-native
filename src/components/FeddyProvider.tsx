import { useEffect, useState } from 'react';
import { type ComposeUIState, uiState } from '../ui-state';
import { FeedbackComposeView } from './FeedbackComposeView';
import { SmartReviewSheet } from './SmartReviewSheet';

export interface FeddyProviderProps {
  children: React.ReactNode;
}

/**
 * Mount once at the root of your app to enable
 * `Feddy.openFeedback()` and `Feddy.requestReviewIfAppropriate()` to
 * imperatively present the built-in modals. Without this provider,
 * those calls are no-ops (log a warning).
 *
 * If you prefer to manage the compose modal yourself, render
 * `<FeedbackComposeView />` directly with your own visible state and
 * skip this provider — but Smart Review still requires the provider
 * (or you can render `<SmartReviewSheet />` yourself).
 */
export function FeddyProvider({ children }: FeddyProviderProps) {
  const [state, setState] = useState<ComposeUIState>(uiState.getState());

  useEffect(() => uiState.subscribe(setState), []);

  return (
    <>
      {children}
      <FeedbackComposeView
        visible={state.visible}
        boardKey={state.boardKey}
        onDismiss={() => {
          uiState.close();
        }}
      />
      <SmartReviewSheet />
    </>
  );
}
