# @agentivity-labs/sdk-react

The React/TypeScript SDK for building applications against the Agentivity platform.

**Scope**: read, execute, and watch history. Creating or editing workflows, agents, teams, or
credentials is an Agentivity Studio (admin) concern and deliberately not exposed here — same
boundary as [`agentivity_sdk_flutter`](../agentivity_sdk_flutter), the Flutter sibling this
package is ported from.

## Status

**v0.3 — full port.** Every subsystem of `agentivity_sdk_flutter` has a React/TypeScript
counterpart:

- **Protocol** — AG-UI event parsing (full spec coverage, including `THINKING_*` with legacy
  `REASONING_*` wire-name tolerance, and the Agentivity-specific `ACTIVITY_*` extension events),
  `AgUiSseChannel` (reconnecting SSE transport, `fetch`+`ReadableStream`), `AgUiStateController`,
  `RunAgentInput`/content parts, the `PlatformStream` interface.
- **Client** — `AgentivityClient` (`entities`, `runs`, `voice`, `conversations`, `agenticFolders`,
  `dataTables`) and `AgentivityPlatformClient` (adds `chat`, `agUiBundles`, `svgIcons`).
  Workflow/team browse endpoints return identification fields only — see the `WorkflowEntity` doc
  comment for why the full node-graph structure (Studio-editor territory) isn't modeled here.
  `dataTables` is row-level only (`listRows`/`insertRow`/`updateRow`/`deleteRow` against
  `/api/v1/datatables/{id}/rows`) — this is how an app reads data a Team's workflow wrote to a
  shared Data Table asset (e.g. list "my trips" without starting a run just to display them) and
  writes back where the app itself owns the data; schema/folders/versions stay Studio-only, same
  boundary as workflows/agents/teams/credentials.
- **Chat** — `ChatController`, `<ChatDiscussion>`/`<ChatInput>`/`<ChatMessageBubble>`, markdown
  rendering (`react-markdown` + `remark-gfm`). Voice recording uses `MediaRecorder` directly (no
  live waveform — just a "recording…" state, since the Whisper backend accepts the container
  `MediaRecorder` produces without needing raw-PCM wrapping).
- **Artifacts** — all 20 built-in widgets (5 charts, 3 data, 2 code, 2 status, math, SVG, 6
  interaction), theme + 13 presets, registry/bundle. Charts are hand-rolled SVG (no charting
  library dependency); code highlighting uses `highlight.js`; math uses `KaTeX`.
- **Theming — one source for every widget.** `ArtifactsThemeData.colors` (a flat
  `ArtifactsColorTokens` map: `primary`, `surface`, `outlineVariant`, …) and `.fontFamily` are the
  single source every artifact/AG-UI widget draws from — cards, charts, choice/question/date-picker
  forms, chat bubbles, activity/run panels. `<ArtifactsThemeProvider theme={...}>` renders them once
  as `--ag-*` CSS custom properties (+ `fontFamily`) on a `display:contents` wrapper; every
  component reads its color via `var(--ag-primary, ...)`, so nothing needs per-component overrides
  and an unthemed app still renders the same built-in defaults. 13 presets ship
  (`neutral`/`glacier`/`brutalist`/`paper`/`candy`/`noir`/`aurora`/`velvet`/`ember`/`terminal`/
  `agentivityLight`/`agentivityDark`), each a full color+shape+type recipe. App-specific brand
  themes (e.g. a demo's own identity) are just another `ArtifactsThemeData` object defined in the
  consuming app — they don't belong in this package.
- **Agent subsystem** — `AgUiGenerativeController`/`<GenerativeView>`, `AgUiRunLifecycleController`,
  `AgUiActivityController`/`<ActivityView>`, `AgUiPlatformRunController`, `AgentRunController`/
  `<RunPanel>`/`<RunStatusBadge>`, `AgUiContextRegistry`.
- **Connectors** — `AgentivityPlatformConnector`, `AgentivityRunStream`, `AgUiGenericConnector`,
  `AgentivityConnector`, `LangGraphConnector`, Agentivity platform signals.
- **Forms & Assistant panels** — `FormController`/`<FormPanel>`, `AssistantController`/
  `<AssistantPanel>`.
- **React** — `<AgentivityProvider>`, `<ArtifactsThemeProvider>`, and a hook per controller
  (`useRunStream`, `useChatController`, `useFormController`, `useAgUiState`, …).

**Deliberate simplifications** (documented inline where they matter): image/file attachments are
picked in `<ChatInput>` but not auto-base64-encoded for `RunsApi.startExecution`'s `images` param
— wire that yourself; `WorkflowEntity` omits the full node-graph (Studio-editor scope); date
pickers use the browser's native `<input type="date">` rather than a custom calendar widget.

## Usage

```tsx
import { AgentivityProvider, useAgentivityClient, useRunStream } from '@agentivity-labs/sdk-react';

function App() {
  return (
    <AgentivityProvider baseUrl="https://my-backend.example.com">
      <RunAgent />
    </AgentivityProvider>
  );
}

function RunAgent() {
  const client = useAgentivityClient();
  const [streamUrl, setStreamUrl] = useState<string>();

  async function start() {
    const entities = await client.entities.fetchEntities({ kind: 'agent' });
    const session = await client.runs.startExecution({ entityId: entities[0].id, input: 'Hello' });
    setStreamUrl(session.streamUrl);
  }

  const { events, connected } = useRunStream(streamUrl);

  return (
    <div>
      <button onClick={start}>Start</button>
      <p>{connected ? 'connected' : 'disconnected'}</p>
      <ul>
        {events.map((e, i) => (
          <li key={i}>{e.type}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Chat

```tsx
import { useEffect, useMemo, useState } from 'react';
import { AgentivityProvider, useAgentivityClient, useRunStream, ChatController, ChatDiscussion } from '@agentivity-labs/sdk-react';
import '@agentivity-labs/sdk-react/styles.css'; // optional default styling

function AgentChat({ agentId }: { agentId: string }) {
  const client = useAgentivityClient();
  const [streamUrl, setStreamUrl] = useState<string>();
  const [executionId, setExecutionId] = useState<string>();
  const controller = useMemo(() => new ChatController({ contextId: agentId }), [agentId]);

  const { events } = useRunStream(streamUrl);
  useEffect(() => {
    events.forEach(controller.feedEvent);
  }, [events, controller]);

  async function handleSend(text: string) {
    const session = await client.runs.startExecution({ entityId: agentId, input: text, executionId, enableHil: true });
    setExecutionId(session.executionId);
    setStreamUrl(session.streamUrl);
  }

  return (
    <ChatDiscussion
      controller={controller}
      onSend={handleSend}
      onHilResponse={(gate, text, source) => client.runs.submitHilResponse({ executionId: executionId!, requestId: gate.requestId, response: text, source })}
      widgetRegistry={{
        /* ChoiceCard: (props) => <MyChoiceCard {...props} />, */
      }}
    />
  );
}
```

### Graphs from JSON (a catalog, a preview, a documentation page)

`TemplateGraph` draws a team (its members and how they work together) or a workflow (its flow) from the JSON alone: no run, no chat, no controller.

```tsx
import { TemplateGraph } from '@agentivity-labs/sdk-react';
import '@agentivity-labs/sdk-react/styles.css';

// `template` is a Template file; the graph is the one of its root, and the other entities give names to the members.
<TemplateGraph source={template} autoplay />
```

`source` is anything `resolveRenderable` accepts, as an object or as JSON text: a **Template file** (`schema: "agentivity.template"`),
the **root payload** of the marketplace (`GET /api/v1/templates/{id}/root`: the catalog wrapper plus a `members` map), the catalog **wrapper**
`{ kind, name, entryJson }`, or a **bare** team / workflow / agent. An agent is drawn as the graph inside it. Something that cannot be drawn
shows a short message instead of throwing (`resolveRenderable` itself throws a `RenderableError` with a `code`).

- `autoplay` lights the members (or the steps) up one after the other, as a run would. It is off by default and never plays for a visitor who
  prefers reduced motion; `stepMs` sets how long each step stays lit.
- `interactive` (default **false**) lets the visitor drag, zoom and fit the drawing. A catalog page scrolls, so by default the wheel scrolls the page.
- `camera` (`'fit'` by default) is for a workflow, and for the graph inside an agent; a team is not affected. `fit` keeps the whole diagram in
  view, which makes a long workflow a thin strip. `follow` opens on the start node at a readable scale and, with `autoplay`, glides from one
  active node to the next (back to the start when the loop begins again); without `autoplay`, or for a visitor who prefers reduced motion,
  it is a still picture centred on the start. In `follow` the frame is a viewer of its own: it takes the height its host gives it
  (`height: 100%` of a parent whose height is fixed), otherwise it is 16:9 with a minimum of 240 px, and the drawing is clipped by that frame
  only. A gesture of the visitor takes the camera until the recenter button gives it back.
- `resolveMemberAvatar` maps a member to an image or emoji of your own; by default the icon and group color of the team editor are used.
- The drawing fills the width it is given and sets its own height (a graph keeps its proportions): give it a column, not a fixed height. (Only `camera="follow"` on a workflow uses the height you give it.)

`TeamGraph` and `WorkflowGraph` also work without a `controller` now (a still picture, or driven by `statuses`); `WorkflowGraph` takes
`camera="fit"` to keep the whole diagram in view instead of following the running step. The standalone `<agentivity-graph>` has the same
`camera="follow"` / `"fit"` attribute: `<agentivity-graph src="…/root" camera="follow" autoplay interactive style="height: 420px">`.

## Development

```bash
npm install
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
npm run typecheck
npm test
```
