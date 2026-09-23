import type { AgUiEvent, AgUiInterrupt, AgUiRunOutcome } from '../../protocol/events.js';

/** State of the agent run tracked by {@link AgUiRunLifecycleController}. */
export type AgUiRunState = 'idle' | 'running' | 'finished' | 'error';

type Listener = () => void;

/**
 * SSE-native run lifecycle controller — port of `AgUiRunLifecycleController`.
 *
 * Tracks run lifecycle from AG-UI events: `RUN_STARTED`, `RUN_FINISHED`,
 * `RUN_ERROR`, `STEP_STARTED`, `STEP_FINISHED`.
 *
 * **When to use this vs {@link AgentRunController}**: use this controller when
 * you consume a raw AG-UI event stream (e.g. from `useRunStream`) — the
 * AG-UI-native approach, pairing with {@link AgUiGenerativeController} for
 * full generative chat. Use {@link AgentRunController} when your backend
 * exposes a separate REST contract for runs.
 *
 * ```ts
 * const lifecycle = new AgUiRunLifecycleController();
 * events.forEach(lifecycle.feedEvent);
 * ```
 */
export class AgUiRunLifecycleController {
  private runStateValue: AgUiRunState = 'idle';
  private runIdValue: string | undefined;
  private threadIdValue: string | undefined;
  private errorMessageValue: string | undefined;
  private errorCodeValue: string | undefined;
  private currentStepValue: string | undefined;
  private outcomeValue: AgUiRunOutcome | undefined;
  private resultValue: unknown;
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get runState(): AgUiRunState {
    return this.runStateValue;
  }
  get runId(): string | undefined {
    return this.runIdValue;
  }
  get threadId(): string | undefined {
    return this.threadIdValue;
  }
  get errorMessage(): string | undefined {
    return this.errorMessageValue;
  }
  get errorCode(): string | undefined {
    return this.errorCodeValue;
  }
  /** The step currently executing, or `undefined` between steps. */
  get currentStep(): string | undefined {
    return this.currentStepValue;
  }
  /** Raw result value from `RUN_FINISHED`, if any. */
  get result(): unknown {
    return this.resultValue;
  }
  /** The run outcome, set when `runState` is `'finished'`. */
  get outcome(): AgUiRunOutcome | undefined {
    return this.outcomeValue;
  }

  get isIdle(): boolean {
    return this.runStateValue === 'idle';
  }
  get isRunning(): boolean {
    return this.runStateValue === 'running';
  }
  get isFinished(): boolean {
    return this.runStateValue === 'finished';
  }
  get hasError(): boolean {
    return this.runStateValue === 'error';
  }

  /** `true` when the run finished with an interrupt — check `interrupts` for details. */
  get isInterrupted(): boolean {
    return this.outcomeValue?.kind === 'interrupt';
  }

  /** The interrupts from the last run, or empty if none. */
  get interrupts(): AgUiInterrupt[] {
    return this.outcomeValue?.kind === 'interrupt' ? this.outcomeValue.interrupts : [];
  }

  feedEvent = (event: AgUiEvent): void => {
    switch (event.type) {
      case 'RUN_STARTED':
        this.runStateValue = 'running';
        this.runIdValue = event.runId;
        this.threadIdValue = event.threadId;
        this.errorMessageValue = undefined;
        this.errorCodeValue = undefined;
        this.outcomeValue = undefined;
        this.resultValue = undefined;
        this.currentStepValue = undefined;
        this.notify();
        break;

      case 'RUN_FINISHED':
        this.runStateValue = 'finished';
        this.outcomeValue = event.outcome;
        this.resultValue = event.result;
        this.currentStepValue = undefined;
        this.notify();
        break;

      case 'RUN_ERROR':
        this.runStateValue = 'error';
        this.errorMessageValue = event.message;
        this.errorCodeValue = event.code;
        this.currentStepValue = undefined;
        this.notify();
        break;

      case 'STEP_STARTED':
        this.currentStepValue = event.stepName;
        this.notify();
        break;

      case 'STEP_FINISHED':
        if (this.currentStepValue === event.stepName) this.currentStepValue = undefined;
        this.notify();
        break;

      default:
        break;
    }
  };
}
