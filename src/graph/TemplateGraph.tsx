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
  /**
   * Called when a member of a team or a node of a workflow is clicked, tapped, or chosen with the keyboard. With it, the graph's
   * elements show a pointer and can be selected; without it the graph is a picture.
   */
  onSelect?: (selection: GraphSelection) => void;
  /** The element shown as selected: a member's `memberEntityId` or a node's id. The app owns the selection. */
  selectedId?: string;
  /** How the zone behind a group of a team is drawn (see `TeamGraph`). No effect on a workflow. */
  zoneLook?: TeamGraphProps['zoneLook'];
  className?: string;
}

/** What was selected in a `TemplateGraph`: a member of a team, or a node of a workflow (or of the graph inside an agent). */
export interface GraphSelection {
  kind: 'member' | 'node';
  /** A member's `memberEntityId`, or a node's id. */
  id: string;
  displayName: string;
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

/** The color of an agent's group: its graph keeps it in its metadata. */
function agentColorOf(renderable: Renderable): string | undefined {
  if (renderable.kind !== 'agent') return undefined;
  const graph = renderable.entity['graph'];
  const metadata = graph && typeof graph === 'object' ? (graph as Record<string, unknown>)['metadata'] : undefined;
  const color = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['groupColor'] : undefined;
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : undefined;
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

function TeamView({ renderable, resolveMemberAvatar, autoplay, stepMs, interactive, onSelect, selectedId, zoneLook, className }: { renderable: Renderable } & Omit<TemplateGraphProps, 'source'>) {
  const { members, hubMemberId, topology } = useMemo(() => teamMembersOf(renderable), [renderable]);
  const playing = usePlayback<Extract<TeamMemberStatus, 'working' | 'done'>>(
    members.map((m) => m.memberEntityId),
    !!autoplay,
    stepMs ?? 1400,
  );
  return <TeamGraph members={members} hubMemberId={hubMemberId} topology={topology} resolveMemberAvatar={resolveMemberAvatar} restingColors={!playing} statuses={playing} interactive={interactive} zoneLook={zoneLook} selectedMemberId={selectedId} onMemberSelect={onSelect ? (m) => onSelect({ kind: 'member', id: m.memberEntityId, displayName: m.displayName }) : undefined} className={className} />;
}

function WorkflowView({ structure, agentColor, autoplay, stepMs, interactive, camera, onSelect, selectedId, className }: { structure: WorkflowGraphStructure; agentColor?: string } & Omit<TemplateGraphProps, 'source' | 'resolveMemberAvatar'>) {
  const walk = useMemo(() => workflowWalk(structure), [structure]);
  const playing = usePlayback<Extract<WorkflowStepStatus, 'working' | 'done'>>(walk, !!autoplay, stepMs ?? 1100);
  return <WorkflowGraph agentColor={agentColor} structure={structure} statuses={playing} camera={camera ?? 'fit'} interactive={interactive} selectedNodeId={selectedId} onNodeSelect={onSelect ? (n) => onSelect({ kind: 'node', id: n.id, displayName: n.displayName }) : undefined} className={className} />;
}

/**
 * A graph of anything the platform can describe: a team as its constellation of members, a workflow (or the graph inside an
 * agent) as its flow. It needs no run and no chat — it is the picture for a catalog, a preview or a documentation page.
 * An unreadable source draws a short message instead of throwing.
 */
export function TemplateGraph({ source, resolveMemberAvatar, autoplay, stepMs, interactive = false, camera = 'fit', onSelect, selectedId, zoneLook, className }: TemplateGraphProps) {
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
    return <TeamView renderable={resolved.renderable} resolveMemberAvatar={resolveMemberAvatar} autoplay={autoplay} stepMs={stepMs} interactive={interactive} onSelect={onSelect} selectedId={selectedId} zoneLook={zoneLook} className={className} />;
  }
  if (!structure || structure.nodes.length === 0) {
    return (
      <div className={['ag-template-graph', 'ag-template-graph--error', className].filter(Boolean).join(' ')} role="img" aria-label="Nothing to draw">
        This {resolved.renderable.kind} has no steps to draw.
      </div>
    );
  }
  return <WorkflowView agentColor={agentColorOf(resolved.renderable)} structure={structure} autoplay={autoplay} stepMs={stepMs} interactive={interactive} camera={camera} onSelect={onSelect} selectedId={selectedId} className={className} />;
}
