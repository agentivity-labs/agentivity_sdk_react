import { useEffect, useMemo, useState } from 'react';
import type { TeamMemberStatus, WorkflowStepStatus } from '../chat/chat-controller.js';
import { TeamGraph, type TeamGraphProps } from '../chat/components/TeamGraph.js';
import { WorkflowGraph } from '../chat/components/WorkflowGraph.js';
import { teamHubMemberId, teamMembersFromStructure, teamTopology } from '../chat/components/team-member.js';
import { parseTeamStructure, type TeamStructure } from '../client/domain/team-definition-models.js';
import { parseWorkflowGraph, type WorkflowGraphStructure } from '../client/domain/workflow-graph-models.js';
import { resolveRenderable, type Renderable } from './renderable.js';

export interface TemplateGraphProps {
  /**
   * What to draw: a Template file, the marketplace's root payload, a catalog wrapper or a bare team / workflow / agent — an
   * object or its JSON text (see {@link resolveRenderable}). A Template is drawn from its root.
   */
  source: unknown;
  /** Maps a member to an image or emoji of the app's own; by default the icon and group color the team editor chose. */
  resolveMemberAvatar?: TeamGraphProps['resolveMemberAvatar'];
  /**
   * Light the members (or the steps) up one after the other, as a run would: a living picture for a catalog. Off by default,
   * and never done for a visitor who prefers reduced motion.
   */
  autoplay?: boolean;
  /** How long each step stays lit, in milliseconds. */
  stepMs?: number;
  /**
   * Whether the visitor can drag, zoom and fit the drawing. Default false: a Template graph is a picture on a page that
   * scrolls, so the wheel scrolls the page. Turn it on for a full-screen view.
   */
  interactive?: boolean;
  /**
   * Where the camera looks on a workflow (and on the graph inside an agent). `fit` (the default) keeps the whole diagram in view.
   * `follow` opens on the start node at a readable scale and, with `autoplay`, glides from one active node to the next; the frame is
   * then a viewer of its own (the height of its host, or 16:9). No effect on a team.
   */
  camera?: 'follow' | 'fit';
  className?: string;
}

/** A team ready for `TeamGraph`: its members named from what the Template (or the marketplace) says about them. */
function teamMembersOf(renderable: Renderable) {
  const structure: TeamStructure = parseTeamStructure(renderable.entity);
  const named: TeamStructure = {
    ...structure,
    members: structure.members.map((m) => {
      const known = renderable.entitiesById.get(m.memberEntityId);
      return { ...m, displayName: m.displayName ?? known?.name, role: m.role ?? known?.role };
    }),
  };
  return { members: teamMembersFromStructure(named), hubMemberId: teamHubMemberId(named), topology: teamTopology(named) };
}

/** The order in which a run walks a workflow: from its start, following the edges; whatever is left comes last. */
export function workflowWalk(structure: WorkflowGraphStructure): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [structure.entryNodeId ?? structure.nodes[0]?.id].filter((id): id is string => !!id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const edge of structure.edges) if (edge.from === id && !seen.has(edge.to)) queue.push(edge.to);
  }
  for (const node of structure.nodes) if (!seen.has(node.id)) order.push(node.id);
  return order;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Walks through `ids` one after the other, forever: the ones already passed read as done, the current one as working, with a
 * short pause at rest between rounds. Returns `undefined` while it is not playing, so a graph stays a still picture.
 */
function usePlayback<S extends 'working' | 'done'>(ids: readonly string[], enabled: boolean, stepMs: number): ReadonlyMap<string, S> | undefined {
  const [step, setStep] = useState(0);
  const key = ids.join('|');
  const active = enabled && ids.length > 0 && !prefersReducedMotion();
  useEffect(() => {
    if (!active) return;
    setStep(0);
    const timer = setInterval(() => setStep((s) => (s + 1) % (ids.length + 2)), stepMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the content of `ids`
  }, [active, key, stepMs]);
  return useMemo(() => {
    if (!active) return undefined;
    const statuses = new Map<string, S>();
    // Steps 0..n-1 light one member; the last two rounds leave everything done, then everything at rest again.
    if (step >= ids.length + 1) return statuses;
    ids.forEach((id, i) => {
      if (i < step) statuses.set(id, 'done' as S);
      else if (i === step) statuses.set(id, 'working' as S);
    });
    if (step === ids.length) ids.forEach((id) => statuses.set(id, 'done' as S));
    return statuses;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the content of `ids`
  }, [active, step, key]);
}

function TeamView({ renderable, resolveMemberAvatar, autoplay, stepMs, interactive, className }: { renderable: Renderable } & Omit<TemplateGraphProps, 'source'>) {
  const { members, hubMemberId, topology } = useMemo(() => teamMembersOf(renderable), [renderable]);
  const playing = usePlayback<Extract<TeamMemberStatus, 'working' | 'done'>>(
    members.map((m) => m.memberEntityId),
    !!autoplay,
    stepMs ?? 1400,
  );
  return <TeamGraph members={members} hubMemberId={hubMemberId} topology={topology} resolveMemberAvatar={resolveMemberAvatar} restingColors={!playing} statuses={playing} interactive={interactive} className={className} />;
}

function WorkflowView({ structure, autoplay, stepMs, interactive, camera, className }: { structure: WorkflowGraphStructure } & Omit<TemplateGraphProps, 'source' | 'resolveMemberAvatar'>) {
  const walk = useMemo(() => workflowWalk(structure), [structure]);
  const playing = usePlayback<Extract<WorkflowStepStatus, 'working' | 'done'>>(walk, !!autoplay, stepMs ?? 1100);
  return <WorkflowGraph structure={structure} statuses={playing} camera={camera ?? 'fit'} interactive={interactive} className={className} />;
}

/**
 * A graph of anything the platform can describe: a team as its constellation of members, a workflow (or the graph inside an
 * agent) as its flow. It needs no run and no chat — it is the picture for a catalog, a preview or a documentation page.
 * An unreadable source draws a short message instead of throwing.
 */
export function TemplateGraph({ source, resolveMemberAvatar, autoplay, stepMs, interactive = false, camera = 'fit', className }: TemplateGraphProps) {
  const resolved = useMemo(() => {
    try {
      return { renderable: resolveRenderable(source) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Nothing to draw.' };
    }
  }, [source]);

  const structure = useMemo<WorkflowGraphStructure | undefined>(() => {
    const renderable = resolved.renderable;
    if (!renderable || renderable.kind === 'team') return undefined;
    const graph = renderable.kind === 'agent' ? renderable.entity['graph'] : renderable.entity;
    return graph && typeof graph === 'object' ? parseWorkflowGraph(graph as Record<string, unknown>) : undefined;
  }, [resolved]);

  if (!resolved.renderable) {
    return (
      <div className={['ag-template-graph', 'ag-template-graph--error', className].filter(Boolean).join(' ')} role="img" aria-label="Nothing to draw">
        {resolved.error}
      </div>
    );
  }
  if (resolved.renderable.kind === 'team') {
    return <TeamView renderable={resolved.renderable} resolveMemberAvatar={resolveMemberAvatar} autoplay={autoplay} stepMs={stepMs} interactive={interactive} className={className} />;
  }
  if (!structure || structure.nodes.length === 0) {
    return (
      <div className={['ag-template-graph', 'ag-template-graph--error', className].filter(Boolean).join(' ')} role="img" aria-label="Nothing to draw">
        This {resolved.renderable.kind} has no steps to draw.
      </div>
    );
  }
  return <WorkflowView structure={structure} autoplay={autoplay} stepMs={stepMs} interactive={interactive} camera={camera} className={className} />;
}
