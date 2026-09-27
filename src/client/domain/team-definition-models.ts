import { parseIconRef, type IconRef } from '../../icons/icon-ref.js';

// Team definition (members, connections) — read-only.

function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : [];
}

/** One member of a team, as saved in the team editor. */
export interface TeamMemberPosition {
  /** This member's slot in the team (what connections and `managerAgentId` refer to). */
  topologyPositionId: string;
  /** The agent, team or workflow behind the slot — the id a run reports on each of its steps. */
  memberEntityId: string;
  /** `agent`, `team` or `workflow`. */
  memberType: string;
  displayName?: string;
  role?: string;
  /** The icon the member wears — an {@link IconRef} into the platform's icon catalog (`GET /api/v1/icons`), chosen in the team editor or suggested when it was saved. */
  icon?: IconRef;
  /** The group the team editor put this member in, if any. */
  group?: string;
}

/** A directed link between two members of a team. */
export interface TeamConnectionDefinition {
  fromTopologyPositionId: string;
  toTopologyPositionId: string;
  /** `sequential`, `parallel`, `delegate`, `loop`… as the backend names them (lower-cased). */
  types: string[];
}

/** A team's saved definition: who its members are, how they are connected and which one manages. */
export interface TeamStructure {
  id: string;
  name: string;
  /** `sequential`, `concurrent`, `handoff`, `group-chat`, `manager-led`… */
  orchestratorId: string;
  /** The {@link TeamMemberPosition.topologyPositionId} of the manager (manager-led teams). */
  managerTopologyPositionId?: string;
  goal?: string;
  members: TeamMemberPosition[];
  connections: TeamConnectionDefinition[];
  /** Colors the team editor chose for groups (`#RRGGBB`), by group key (trimmed, lower-case). A group without one gets the default color. */
  groupColors: Record<string, string>;
}

export function parseTeamMemberPosition(json: Record<string, unknown>): TeamMemberPosition {
  return {
    topologyPositionId: text(json['topologyPositionId']) ?? '',
    memberEntityId: text(json['memberEntityId']) ?? '',
    memberType: (text(json['memberType']) ?? 'agent').toLowerCase(),
    displayName: text(json['displayName']),
    role: text(json['role']),
    icon: parseIconRef(json['icon']),
    group: text(json['group']),
  };
}

function parseGroupColors(raw: unknown): Record<string, string> {
  const colors: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [group, color] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim())) colors[group.trim().toLowerCase()] = color.trim().toUpperCase();
    }
  }
  return colors;
}

export function parseTeamStructure(json: Record<string, unknown>): TeamStructure {
  return {
    id: text(json['id']) ?? '',
    name: text(json['name']) ?? '',
    orchestratorId: text(json['orchestratorId']) ?? '',
    managerTopologyPositionId: text(json['managerAgentId']),
    goal: text(json['goal']),
    members: records(json['members']).map(parseTeamMemberPosition),
    connections: records(json['connections']).map((c) => ({
      fromTopologyPositionId: text(c['fromTopologyPositionId']) ?? '',
      toTopologyPositionId: text(c['toTopologyPositionId']) ?? '',
      types: Array.isArray(c['types']) ? c['types'].map((t) => String(t).toLowerCase()) : [],
    })),
    groupColors: parseGroupColors(json['groupColors']),
  };
}

/** The manager's member, when the team has one. */
export function teamManager(team: TeamStructure): TeamMemberPosition | undefined {
  return team.managerTopologyPositionId ? team.members.find((m) => m.topologyPositionId === team.managerTopologyPositionId) : undefined;
}
