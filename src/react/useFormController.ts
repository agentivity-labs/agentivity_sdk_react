import { useMemo, useSyncExternalStore } from 'react';
import type { FormController } from '../ag-ui/forms/form-controller.js';
import type { FormRequest } from '../ag-ui/forms/form-models.js';

export interface UseFormControllerResult {
  requests: FormRequest[];
  isLoading: boolean;
  errorMessage: string | undefined;
  activeRequestId: string | undefined;
  hasPending: boolean;
}

/** React binding for {@link FormController} — re-renders whenever its state changes. */
export function useFormController(controller: FormController): UseFormControllerResult {
  const requests = useSyncExternalStore(controller.subscribe, () => controller.requests);
  const isLoading = useSyncExternalStore(controller.subscribe, () => controller.isLoading);
  const errorMessage = useSyncExternalStore(controller.subscribe, () => controller.errorMessage);
  const activeRequestId = useSyncExternalStore(controller.subscribe, () => controller.activeRequestId);

  return useMemo(() => ({ requests, isLoading, errorMessage, activeRequestId, hasPending: requests.length > 0 }), [requests, isLoading, errorMessage, activeRequestId]);
}
