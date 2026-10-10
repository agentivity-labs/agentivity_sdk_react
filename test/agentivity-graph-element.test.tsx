import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/standalone/agentivity-graph.js';

const agent = (id: string, name: string) => ({ id, name, graph: { id: 'g-' + id, entryNode: 'agent', nodes: [{ id: 'agent', nodeType: 'ai.node', inputs: {} }], connections: [] } });
const team = {
  id: 'team-1',
  name: 'SEO team',
  orchestratorId: 'manager-led',
  managerAgentId: 'p1',
  members: [
    { topologyPositionId: 'p1', memberEntityId: 'a-lead', memberType: 'agent' },
    { topologyPositionId: 'p2', memberEntityId: 'a-writer', memberType: 'agent' },
  ],
  connections: [],
};
const template = {
  schema: 'agentivity.template',
  schemaVersion: 1,
  id: 'seo-factory',
  version: '1.0.0',
  name: 'SEO factory',
  root: { kind: 'team', id: 'team-1' },
  entities: [
    { kind: 'team', id: 'team-1', name: 'SEO team', entry: team },
    { kind: 'agent', id: 'a-lead', name: 'Content Manager', entry: agent('a-lead', 'Content Manager') },
    { kind: 'agent', id: 'a-writer', name: 'Writer', entry: agent('a-writer', 'Writer') },
  ],
};

const make = (attributes: Record<string, string> = {}) => {
  const el = document.createElement('agentivity-graph');
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.appendChild(el);
  return el as HTMLElement & { source: unknown };
};
const svgOf = (el: HTMLElement) => el.shadowRoot?.querySelector('svg.ag-team-graph') ?? null;
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('<agentivity-graph>', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is a custom element that draws what is set on its source property, inside its shadow root', async () => {
    expect(customElements.get('agentivity-graph')).toBeDefined();
    const el = make();
    el.source = template;
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    // (The styles themselves are read from styles.css by the standalone build; the test runner serves CSS files empty.)
    expect(el.shadowRoot!.querySelector('style')!.textContent).toContain(':host');
    expect(el.shadowRoot!.textContent).toContain('Writer');
    expect(document.querySelector('svg.ag-team-graph')).toBeNull(); // nothing leaks into the page
  });

  it('fetches its src and takes the marketplace envelope off', async () => {
    const fetchMock = answer({ data: template });
    vi.stubGlobal('fetch', fetchMock);
    const ready = vi.fn();
    const el = make();
    el.addEventListener('agentivity-graph-ready', ready);
    el.setAttribute('src', 'https://marketplace.example/api/v1/templates/seo-factory/root');
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith('https://marketplace.example/api/v1/templates/seo-factory/root');
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong, and tells the page, when the file cannot be loaded', async () => {
    vi.stubGlobal('fetch', answer({ error: { code: 'template_not_found' } }, 404));
    const failed = vi.fn();
    const el = make();
    el.addEventListener('agentivity-graph-error', (e) => failed((e as CustomEvent<string>).detail));
    el.setAttribute('src', 'https://marketplace.example/api/v1/templates/nope/root');
    await vi.waitFor(() => expect(el.shadowRoot!.textContent).toContain('404'));
    expect(failed).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(svgOf(el)).toBeNull();
  });

  it('is a still picture that scrolls with the page unless told otherwise', async () => {
    const el = make();
    el.source = template;
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    expect(svgOf(el)!.getAttribute('data-interactive')).toBe('false');
    expect(svgOf(el)!.getAttribute('data-run')).toBe('none');

    const live = make({ interactive: '' });
    live.source = template;
    await vi.waitFor(() => expect(svgOf(live)).not.toBeNull());
    expect(svgOf(live)!.getAttribute('data-interactive')).toBeNull();
  });

  it('plays when it has autoplay', async () => {
    const el = make({ autoplay: '', 'step-ms': '500' });
    el.source = template;
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    expect(svgOf(el)!.getAttribute('data-run')).toBe('active');
  });

  it('follows its attributes when they change', async () => {
    const el = make();
    el.source = template;
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    el.setAttribute('autoplay', '');
    await vi.waitFor(() => expect(svgOf(el)!.getAttribute('data-run')).toBe('active'));
    el.removeAttribute('autoplay');
    await vi.waitFor(() => expect(svgOf(el)!.getAttribute('data-run')).toBe('none'));
  });

  it('takes a camera attribute for a workflow: fit by default, follow on request', async () => {
    const workflow = {
      kind: 'workflow',
      name: 'Flow',
      entryJson: {
        id: 'w',
        entryNode: 'a',
        nodes: [{ id: 'a', nodeType: 'core.start', inputs: {} }, { id: 'b', nodeType: 'core.http', inputs: {} }],
        connections: [{ from: 'a', to: 'b', fromPort: 'out', toPort: 'in' }],
      },
    };
    const frame = (el: HTMLElement) => el.shadowRoot?.querySelector('.ag-workflow-graph-fit') ?? null;

    const fit = make();
    fit.source = workflow;
    await vi.waitFor(() => expect(frame(fit)).not.toBeNull());
    expect(frame(fit)!.getAttribute('data-camera')).toBe('fit');

    const follow = make({ camera: 'follow' });
    follow.source = workflow;
    await vi.waitFor(() => expect(frame(follow)).not.toBeNull());
    expect(frame(follow)!.getAttribute('data-camera')).toBe('follow');

    follow.setAttribute('camera', 'fit');
    await vi.waitFor(() => expect(frame(follow)!.getAttribute('data-camera')).toBe('fit'));
    expect(follow.shadowRoot!.querySelector('div')!.style.height).toBe('100%');
  });

  it('cleans up when it leaves the page', async () => {
    const el = make();
    el.source = template;
    await vi.waitFor(() => expect(svgOf(el)).not.toBeNull());
    el.remove();
    expect(el.shadowRoot!.childNodes).toHaveLength(0);
  });
});
