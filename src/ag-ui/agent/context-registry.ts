/** A single readable context entry. */
export interface AgUiContextEntry {
  /** Human-readable description visible to the agent. */
  description: string;
  /** The data — must be JSON-serializable. */
  value: unknown;
}

function contextEntryToJson(e: AgUiContextEntry): Record<string, unknown> {
  return { description: e.description, value: e.value };
}

/**
 * A registry that collects readable context entries and builds the `context`
 * list for `RunAgentInput` — port of `AgUiContextRegistry`.
 *
 * The React equivalent of CopilotKit's `useCopilotReadable` hook: the
 * frontend declares data the agent can read on every run, without the caller
 * having to rebuild the context list manually each time.
 *
 * ```ts
 * const context = new AgUiContextRegistry();
 * context.register('cart', { description: 'Current shopping cart contents', value: { items: ['apple', 'bread'], total: 12.5 } });
 * context.update('cart', newCart);
 * const input = { threadId, runId, messages: history, context: context.build() };
 * ```
 */
export class AgUiContextRegistry {
  private readonly entries = new Map<string, AgUiContextEntry>();

  /** Registers or replaces a context entry under `key`. */
  register(key: string, entry: AgUiContextEntry): void {
    this.entries.set(key, entry);
  }

  /** Updates the value of an existing entry (description unchanged). No-op if `key` is not registered. */
  update(key: string, value: unknown): void {
    const existing = this.entries.get(key);
    if (existing) this.entries.set(key, { description: existing.description, value });
  }

  /** Removes an entry. No-op if `key` is not registered. */
  unregister(key: string): void {
    this.entries.delete(key);
  }

  /** Removes all entries. */
  clear(): void {
    this.entries.clear();
  }

  get isEmpty(): boolean {
    return this.entries.size === 0;
  }
  get size(): number {
    return this.entries.size;
  }

  /** Builds the `context` list for `RunAgentInput.context`. */
  build(): Record<string, unknown>[] {
    return [...this.entries.values()].map(contextEntryToJson);
  }
}
