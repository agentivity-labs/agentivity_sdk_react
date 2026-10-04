import type { AgUiRunError } from '../chat-controller.js';

export interface ChatRunErrorProps {
  error: AgUiRunError;
  /** Called when the user dismisses the notice. The notice has no dismiss button when omitted. */
  onDismiss?: () => void;
  className?: string;
}

/** What each error code the platform reports means for the person using the app — a headline, and the next step when there is one. */
const KNOWN: Record<string, { title: string; hint?: string }> = {
  llm_billing: { title: 'The AI service is out of credit', hint: "Add credit to the AI provider account, then send your message again." },
  llm_auth: { title: 'The AI service rejected its API key', hint: "Check the API key configured for the model, then send your message again." },
  llm_rate_limited: { title: 'The AI service is busy', hint: 'Wait a moment, then send your message again.' },
  llm_unavailable: { title: 'The AI service is unavailable', hint: 'Try again in a few minutes.' },
};

/** The headline and next step for a run error: known codes are worded for the end user, anything else is a plain "Something went wrong". */
export function describeRunError(error: AgUiRunError): { title: string; hint?: string } {
  return (error.code && KNOWN[error.code]) || { title: 'Something went wrong' };
}

/**
 * The run stopped on an error: what happened, in plain words, and what the provider or platform said. Shown by
 * `ChatDiscussion` whenever the run ends with an error (`controller.runError`) — an account out of credit, a rejected API key
 * or an unavailable AI service must never leave the conversation looking stuck.
 */
export function ChatRunError({ error, onDismiss, className }: ChatRunErrorProps) {
  const { title, hint } = describeRunError(error);
  return (
    <div className={cx('ag-chat-run-error', className)} role="alert" data-code={error.code}>
      <div className="ag-chat-run-error__body">
        <div className="ag-chat-run-error__title">{title}</div>
        {hint && <div className="ag-chat-run-error__hint">{hint}</div>}
        {error.message && <div className="ag-chat-run-error__detail">{error.message}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="ag-chat-run-error__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
