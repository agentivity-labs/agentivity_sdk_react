/** Signature for a tool that runs on the client (browser) rather than the backend. */
export type AgUiToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * A tool that executes on the client (browser) rather than the backend.
 *
 * Declare frontend tools in {@link AgUiFrontendToolRegistry} and pass its
 * `toApiDescriptions()` output in `RunAgentInput.tools` so the agent discovers
 * them.
 */
export interface AgUiFrontendTool {
  /** Must match the tool name the agent uses in `TOOL_CALL_START.toolCallName`. */
  name: string;
  description: string;
  /** JSON Schema object describing the expected `args` map. */
  parametersSchema?: Record<string, unknown>;
  handler: AgUiToolHandler;
}

/**
 * Registry of {@link AgUiFrontendTool}s available to the agent during a run —
 * port of `AgUiFrontendToolRegistry`.
 */
export class AgUiFrontendToolRegistry {
  private readonly toolsByName: Map<string, AgUiFrontendTool>;

  constructor(tools: AgUiFrontendTool[]) {
    this.toolsByName = new Map(tools.map((t) => [t.name, t]));
  }

  get tools(): AgUiFrontendTool[] {
    return [...this.toolsByName.values()];
  }

  has(name: string): boolean {
    return this.toolsByName.has(name);
  }

  /** Executes a registered tool. Throws if `name` is unknown. */
  execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.toolsByName.get(name);
    if (!tool) throw new Error(`No frontend tool registered: "${name}"`);
    return tool.handler(args);
  }

  /** Returns tool descriptors formatted for `RunAgentInput.tools`. */
  toApiDescriptions(): Record<string, unknown>[] {
    return this.tools.map((t) => ({ name: t.name, description: t.description, ...(t.parametersSchema ? { parameters: t.parametersSchema } : {}) }));
  }
}
