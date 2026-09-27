import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { MemberAvatar } from '../src/chat/components/member-avatar.js';
import { TeamGraph } from '../src/chat/components/TeamGraph.js';
import { TEAM_GROUP_PALETTE, groupColorOverrides, orderByGroup, teamGroupColors } from '../src/chat/components/team-groups.js';
import { TeamRoster } from '../src/chat/components/TeamRoster.js';
import { teamAvatarResolver, teamHubMemberId, teamMembersFromStructure } from '../src/chat/components/team-member.js';
import { AgentivityHttpCore } from '../src/client/http-core.js';
import { IconsApi } from '../src/client/api/icons-api.js';
import { parseTeamStructure } from '../src/client/domain/team-definition-models.js';
import { Icon, iconGlyph } from '../src/icons/Icon.js';
import { iconRefOf, parseIconInfo } from '../src/icons/icon-catalog-models.js';
import { materialIcon, parseIconRef } from '../src/icons/icon-ref.js';

// Material code points as Flutter's MaterialIcons font has them (Icons.explore / hotel / flight).
const COMPASS = materialIcon('E248');
const BED = materialIcon('E322');
const PLANE = materialIcon('E297');

const TEAM_JSON = {
  id: 'team-1',
  name: 'Trip Manager Team',
  orchestratorId: 'manager-led',
  managerAgentId: 'manager',
  members: [
    { topologyPositionId: 'manager', memberEntityId: 'agent-mgr', memberType: 'agent', displayName: 'Trip Manager', icon: { type: 'material', value: 'E248' } },
    { topologyPositionId: 'hotel', memberEntityId: 'agent-hotel', memberType: 'agent', displayName: 'Hotel Specialist', icon: { type: 'material', value: 'E322' }, group: 'Booking' },
    { topologyPositionId: 'flight', memberEntityId: 'agent-flight', memberType: 'agent', displayName: 'Flight Specialist', icon: { type: 'material', value: 'E297' }, group: ' booking ' },
    { topologyPositionId: 'visa', memberEntityId: 'agent-visa', memberType: 'agent', displayName: 'Visa Specialist', group: 'Advice' },
  ],
  connections: [{ fromTopologyPositionId: 'manager', toTopologyPositionId: 'hotel', types: ['Delegate'] }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('icon references', () => {
  it('reads the shape the backend stores, and nothing else', () => {
    expect(parseIconRef({ type: 'Material', value: ' E322 ' })).toEqual({ type: 'material', value: 'E322' });
    expect(parseIconRef({ type: 'material', value: 'E322', color: '#fff' })).toEqual({ type: 'material', value: 'E322', color: '#fff' });
    expect(parseIconRef('E322')).toBeUndefined();
    expect(parseIconRef({ type: 'material' })).toBeUndefined();
    expect(parseIconRef({ value: 'E322' })).toBeUndefined();
    expect(parseIconRef(null)).toBeUndefined();
    expect(parseIconRef([])).toBeUndefined();
  });
});

describe('Material glyphs', () => {
  it('the glyph of an icon is the character at its code point, in any case', () => {
    expect(iconGlyph(BED)).toBe('\uE322');
    expect(iconGlyph(materialIcon('e322'))).toBe('\uE322');
    expect(iconGlyph(materialIcon('F10E'))).toBe('\uF10E');
  });

  it('draws an icon inline, scaled by size', () => {
    const { container } = render(<Icon icon={BED} size={20} />);
    const span = container.querySelector('span.ag-icon') as HTMLElement;

    expect(span.textContent).toBe('\uE322');
    expect(span.style.fontSize).toBe('20px');
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws SVG text, centred in its box, when positioned inside an <svg>', () => {
    const { container } = render(
      <svg>
        <Icon icon={BED} x={-10} y={-10} size={20} className="glyph" />
      </svg>,
    );
    const text = container.querySelector('text.ag-icon.glyph')!;

    expect(text.textContent).toBe('\uE322');
    expect(text.getAttribute('x')).toBe('0');
    expect(text.getAttribute('y')).toBe('0');
    expect(text.getAttribute('font-size')).toBe('20');
  });

  it('draws the fallback for no icon, a set this SDK does not draw, or a value that is not a code point', () => {
    for (const icon of [undefined, { type: 'lucide', value: 'plane' }, { type: 'material', value: 'hotel' }, { type: 'material', value: '0' }]) {
      const { container, unmount } = render(<Icon icon={icon} fallback={<b>R</b>} />);
      expect(container.querySelector('.ag-icon')).toBeNull();
      expect(container.querySelector('b')).not.toBeNull();
      unmount();
    }
  });
});

describe('team groups', () => {
  it('gives groups palette colors in order of first appearance, case-insensitively', () => {
    const colors = teamGroupColors(['Booking', undefined, 'advice', ' booking ', 'Money']);

    expect([...colors.keys()]).toEqual(['booking', 'advice', 'money']);
    expect(colors.get('booking')).toBe(TEAM_GROUP_PALETTE[0]);
    expect(colors.get('advice')).toBe(TEAM_GROUP_PALETTE[1]);
    expect(colors.get('money')).toBe(TEAM_GROUP_PALETTE[2]);
  });

  it('uses the color the team editor chose for a group, and keeps the default order for the others', () => {
    const team = parseTeamStructure({ ...TEAM_JSON, groupColors: { booking: '#123abc', ghost: 'red', advice: '#zzz' } });
    const members = teamMembersFromStructure(team);
    const colors = teamGroupColors(members.map((m) => m.group), groupColorOverrides(members));

    expect(team.groupColors).toEqual({ booking: '#123ABC' });
    expect(colors.get('booking')).toBe('#123ABC');
    expect(colors.get('advice')).toBe(TEAM_GROUP_PALETTE[1]);
    expect(teamAvatarResolver(members)({ memberEntityId: 'agent-hotel' })?.color).toBe('#123ABC');
  });

  it('cycles the palette when there are more groups than colors', () => {
    const many = Array.from({ length: TEAM_GROUP_PALETTE.length + 1 }, (_, i) => `g${i}`);
    expect(teamGroupColors(many).get(`g${TEAM_GROUP_PALETTE.length}`)).toBe(TEAM_GROUP_PALETTE[0]);
  });

  it('keeps a group together, ungrouped last, original order inside each', () => {
    const items: [string, string | undefined][] = [['a', 'X'], ['b', undefined], ['c', 'Y'], ['d', 'x'], ['e', 'Y'], ['f', undefined]];
    expect(orderByGroup(items, (i) => i[1]).map((i) => i[0])).toEqual(['a', 'd', 'c', 'e', 'b', 'f']);
  });
});

describe('team structure', () => {
  it('reads members with their icon reference and group, connections and the manager', () => {
    const team = parseTeamStructure(TEAM_JSON);

    expect(team.orchestratorId).toBe('manager-led');
    expect(team.members).toHaveLength(4);
    expect(team.members[1]).toMatchObject({ icon: { type: 'material', value: 'E322' }, group: 'Booking' });
    expect(team.members[3]!.icon).toBeUndefined();
    expect(team.connections[0]!.types).toEqual(['delegate']);
    expect(teamHubMemberId(team)).toBe('agent-mgr');
  });

  it('ignores an icon that is not a { type, value } reference', () => {
    const team = parseTeamStructure({ members: [{ topologyPositionId: 'a', memberEntityId: 'a', icon: 'E322' }] });
    expect(team.members[0]!.icon).toBeUndefined();
  });

  it('becomes team members for the roster and the graph', () => {
    const members = teamMembersFromStructure(parseTeamStructure(TEAM_JSON));

    expect(members.map((m) => m.memberEntityId)).toEqual(['agent-mgr', 'agent-hotel', 'agent-flight', 'agent-visa']);
    expect(members[1]).toMatchObject({ icon: BED, group: 'Booking' });
  });

  it('is empty, not an error, when the payload has nothing in it', () => {
    const team = parseTeamStructure({});
    expect(team.members).toEqual([]);
    expect(teamHubMemberId(team)).toBeUndefined();
  });
});

describe('icon catalog', () => {
  it('reads a catalog entry, and turns it into the reference to store', () => {
    const info = parseIconInfo({ type: 'material', value: 'e322', name: 'hotel_baseline' });

    expect(info).toEqual({ type: 'material', value: 'E322', name: 'hotel_baseline' });
    expect(iconRefOf(info)).toEqual(BED);
  });

  it('fetches the icons of a set, forwarding the search and featured filters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ type: 'material', value: 'E297', name: 'flight_baseline' }]));
    const icons = await new IconsApi(new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl })).fetchIcons({ type: 'material', q: ' hotel ' });

    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/v1/icons');
    expect(url.searchParams.get('type')).toBe('material');
    expect(url.searchParams.get('q')).toBe('hotel');
    expect(icons).toEqual([{ type: 'material', value: 'E297', name: 'flight_baseline' }]);
  });

  it('asks for everything when no filter is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await new IconsApi(new AgentivityHttpCore({ baseUrl: 'https://api.example.com', fetchImpl })).fetchIcons();

    expect(new URL(fetchImpl.mock.calls[0]![0] as string).search).toBe('');
  });
});

describe('drawing', () => {
  it('an avatar with a catalog icon shows the glyph; an unknown icon falls back to initials', () => {
    const { container } = render(
      <>
        <MemberAvatar member={{ memberEntityId: 'a', displayName: 'Hotel Specialist' }} resolver={() => ({ icon: BED })} />
        <MemberAvatar member={{ memberEntityId: 'b', displayName: 'Zorblax Thing' }} resolver={() => ({ icon: materialIcon('not-hex') })} />
      </>,
    );

    expect(container.querySelectorAll('.ag-icon')).toHaveLength(1);
    expect(screen.getByText('ZT')).toBeInTheDocument();
  });

  it('an emoji the app chose wins over the icon', () => {
    const { container } = render(<MemberAvatar member={{ memberEntityId: 'a', displayName: 'Hotel Specialist' }} resolver={() => ({ emoji: '🏨', icon: BED })} />);

    expect(screen.getByText('🏨')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('the roster and the graph draw each member with the icon and group color the team editor gave it', () => {
    const controller = new ChatController();
    const members = teamMembersFromStructure(parseTeamStructure(TEAM_JSON));
    const { container } = render(
      <>
        <TeamRoster controller={controller} members={members} />
        <TeamGraph controller={controller} members={members} hubMemberId="agent-mgr" />
      </>,
    );

    // Three of the four members carry an icon: drawn once in the roster and once in the graph.
    expect(container.querySelectorAll('.ag-team-roster__avatar .ag-icon')).toHaveLength(3);
    expect(container.querySelectorAll('.ag-team-graph__hex ~ .ag-icon')).toHaveLength(3);
    // Booking is the first group: its members' hexagons are bordered in the first palette color, and their icons wear it.
    const borders = [...container.querySelectorAll<SVGElement>('.ag-team-graph__hex')].map((h) => h.style.stroke.toLowerCase());
    expect(borders.filter((c) => c === 'rgb(255, 138, 91)' || c === TEAM_GROUP_PALETTE[0].toLowerCase()).length).toBeGreaterThan(0);
    const icons = [...container.querySelectorAll<SVGElement>('.ag-team-graph__hex ~ .ag-icon')].map((i) => i.style.color.toLowerCase());
    expect(icons.every((c) => c !== '')).toBe(true);
  });

  it('a graph draws the members of a group next to each other', () => {
    const controller = new ChatController();
    const members = [
      { memberEntityId: 'a', displayName: 'A', group: 'X' },
      { memberEntityId: 'b', displayName: 'B' },
      { memberEntityId: 'c', displayName: 'C', group: 'X' },
    ];
    const { container } = render(<TeamGraph controller={controller} members={members} />);

    const order = [...container.querySelectorAll('.ag-team-graph__node title')].map((t) => t.textContent!.split(' — ')[0]);
    expect(order).toEqual(['A', 'C', 'B']);
  });

  it('the team avatar resolver gives a chat the same icon and group color as the roster', () => {
    const members = teamMembersFromStructure(parseTeamStructure(TEAM_JSON));
    const resolve = teamAvatarResolver(members);

    expect(resolve({ memberEntityId: 'agent-hotel' })).toMatchObject({ icon: BED, color: TEAM_GROUP_PALETTE[0] });
    expect(resolve({ memberEntityId: 'nobody' })).toBeUndefined();
  });

  it('an app-chosen avatar still comes first in the team avatar resolver', () => {
    const members = teamMembersFromStructure(parseTeamStructure(TEAM_JSON));
    const resolve = teamAvatarResolver(members, (m) => (m.memberEntityId === 'agent-hotel' ? { emoji: '🏨' } : undefined));

    expect(resolve({ memberEntityId: 'agent-hotel' })).toMatchObject({ emoji: '🏨', icon: BED });
  });

  it('keeps live statuses working with icons in place', () => {
    const controller = new ChatController();
    const members = teamMembersFromStructure(parseTeamStructure(TEAM_JSON));
    render(<TeamRoster controller={controller} members={members} />);

    act(() => controller.feedEvent({ type: 'STEP_STARTED', stepName: 's', memberEntityId: 'agent-hotel', displayName: 'Hotel Specialist' }));
    expect(screen.getByText('Hotel Specialist, working now')).toBeInTheDocument();
  });
});
