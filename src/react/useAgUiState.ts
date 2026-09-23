import { useSyncExternalStore } from 'react';
import type { AgUiStateController } from '../protocol/state-controller.js';

/** React binding for {@link AgUiStateController} — re-renders whenever the tracked agent state changes. */
export function useAgUiState(controller: AgUiStateController): Record<string, unknown> {
  return useSyncExternalStore(controller.subscribe, () => controller.state);
}
