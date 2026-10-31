import { createContext, useContext, type ReactNode } from 'react';
import presets from './palettes.json';

/** What a palette is made for: the backgrounds its colors read well on. An indication: nothing is refused. */
export type GraphPaletteSuits = 'light' | 'dark' | 'both';

/**
 * A named set of colors for the graphs: a team's groups, a workflow's steps, the states of an execution. It is separate from the
 * theme, which gives the background, the text and the shapes: any palette goes with any theme, and the same palette on a team and
 * on its workflows makes them match.
 */
export interface GraphPalette {
  /** Stable name, the one a team, an agent or a workflow keeps: `modern-red-blue-mauve`. */
  id: string;
  /** Its family: Corporate, Soft, Futurist… */
  category: string;
  name: string;
  suits: GraphPaletteSuits;
  /** The colors offered to a team's groups, in the order groups first appear. A group can still have a color of its own. */
  groups: string[];
  /** One color per kind of workflow step: what a step does. */
  steps: { start: string; decision: string; human: string; ai: string; action: string; end: string };
  /** The colors of an execution: what a member or a step is doing. */
  states: { working: string; waiting: string; done: string; failed: string };
}

/** The palettes that come with the SDK. */
export const GRAPH_PALETTES: readonly GraphPalette[] = presets as GraphPalette[];

export const DEFAULT_GRAPH_PALETTE_ID = 'modern-red-blue-mauve';

export const DEFAULT_GRAPH_PALETTE: GraphPalette = GRAPH_PALETTES.find((p) => p.id === DEFAULT_GRAPH_PALETTE_ID)!;

/** The palette named `id`, or `undefined` when the SDK has no palette of that name. */
export function graphPaletteById(id: string | null | undefined): GraphPalette | undefined {
  return id ? GRAPH_PALETTES.find((p) => p.id === id.trim()) : undefined;
}

/** What can be asked for: a palette, or the name of one of the SDK's. */
export type GraphPaletteRef = GraphPalette | string;

/** The palette `ref` stands for; `undefined` when it names none. */
export function resolveGraphPalette(ref: GraphPaletteRef | null | undefined): GraphPalette | undefined {
  return typeof ref === 'string' ? graphPaletteById(ref) : (ref ?? undefined);
}

/** What can be changed from a palette to make another: every part is optional, and `steps` and `states` can change one color only. */
export interface GraphPaletteChanges {
  id?: string;
  category?: string;
  name?: string;
  suits?: GraphPaletteSuits;
  groups?: string[];
  steps?: Partial<GraphPalette['steps']>;
  states?: Partial<GraphPalette['states']>;
}

/**
 * A palette of your own, made from another: `definePalette('corporate-azure', { id: 'acme', steps: { ai: '#FF5A00' } })`. What is
 * not given is kept from `base`.
 */
export function definePalette(base: GraphPaletteRef, changes: GraphPaletteChanges): GraphPalette {
  const from = resolveGraphPalette(base);
  if (!from) throw new Error(`There is no palette named '${String(base)}'.`);
  return { ...from, ...changes, groups: changes.groups ?? from.groups, steps: { ...from.steps, ...changes.steps }, states: { ...from.states, ...changes.states } };
}

/** The CSS custom properties that give a graph the colors of `palette`. */
export function graphPaletteVars(palette: GraphPalette): Record<string, string> {
  const { states, steps } = palette;
  return {
    '--ag-team-working': states.working,
    '--ag-team-waiting': states.waiting,
    '--ag-team-done': states.done,
    '--ag-team-failed': states.failed,
    '--ag-workflow-working': states.working,
    '--ag-workflow-waiting': states.waiting,
    '--ag-workflow-done': states.done,
    '--ag-workflow-failed': states.failed,
    '--ag-workflow-start': steps.start,
    '--ag-workflow-decision': steps.decision,
    '--ag-workflow-human': steps.human,
    '--ag-workflow-ai': steps.ai,
    '--ag-workflow-action': steps.action,
    '--ag-workflow-end': steps.end,
  };
}

const GraphPaletteContext = createContext<GraphPalette | undefined>(undefined);

/** Gives every graph inside it the same palette, whatever the teams and workflows it shows have chosen. */
export function GraphPaletteProvider({ palette, children }: { palette: GraphPaletteRef; children: ReactNode }) {
  return <GraphPaletteContext.Provider value={resolveGraphPalette(palette)}>{children}</GraphPaletteContext.Provider>;
}

/** The palette a graph is drawn with: the one the app imposes, then its own, then the default. */
export function useGraphPalette(own?: GraphPaletteRef | null): GraphPalette {
  return useContext(GraphPaletteContext) ?? resolveGraphPalette(own) ?? DEFAULT_GRAPH_PALETTE;
}
