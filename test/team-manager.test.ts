import { describe, expect, it } from 'vitest';
import { parseTeamStructure, teamManager } from '../src/client/domain/team-definition-models.js';

// In a manager-led team, the manager is the member at the top of the topology — the first one. Nothing names it.
const team = (orchestratorId: string, extra: Record<string, unknown> = {}) =>
  parseTeamStructure({
    id: 'team-1',
    name: 'Trip team',
    orchestratorId,
    members: [
      { topologyPositionId: 'planner', memberEntityId: 'a-planner', memberType: 'agent' },
      { topologyPositionId: 'hotel', memberEntityId: 'a-hotel', memberType: 'agent' },
    ],
    ...extra,
  });

describe('the manager of a team', () => {
  it('is the member at the top of a manager-led team', () => {
    expect(teamManager(team('manager-led'))?.topologyPositionId).toBe('planner');
  });

  it('is still the member at the top when an older file named another one', () => {
    const older = team('manager-led', { managerAgentId: 'hotel' });

    expect(teamManager(older)?.topologyPositionId).toBe('planner');
    expect('managerTopologyPositionId' in older).toBe(false);
  });

  it('is nobody in a team that is not manager-led', () => {
    expect(teamManager(team('sequential'))).toBeUndefined();
  });
});
