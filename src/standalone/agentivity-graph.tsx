import { createRoot, type Root } from 'react-dom/client';
import graphStyles from '../styles.css?raw';
import { TemplateGraph } from '../graph/TemplateGraph.js';

/**
 * `<agentivity-graph>` — the graph of a Template, a team, a workflow or an agent as one HTML element, for pages that are not
 * React (a static site, a CMS, a docs page). It is the same component as `TemplateGraph`, bundled with React and its styles:
 * one script, no build step on the host.
 *
 * ```html
 * <script src="/agentivity-graph.js"></script>
 * <agentivity-graph src="https://marketplace.agentivity.io/api/v1/templates/byteforge-support/root" autoplay></agentivity-graph>
 * ```
 *
 * Attributes: `src` (a URL answering JSON: a Template file, the marketplace `/root`, a catalog wrapper, an entity; the
 * marketplace `{ data }` envelope is taken off), `autoplay`, `interactive`, `step-ms`, `theme` (`light` or `dark`), `camera`
 * (`fit`, the default, keeps the whole workflow in view; `follow` opens on the start node at a readable scale and, with `autoplay`,
 * glides from one active node to the next — the frame then has the height the page gives the element, or 16:9).
 * Property: `source` (the JSON itself, wins over `src`). Events: `agentivity-graph-ready`, `agentivity-graph-error`
 * (`detail` is the message). The drawing fills the width of the element and sets its own height. The colors follow the
 * `--ag-*` custom properties of the page (they inherit into the element); `theme` only sets a light or a dark default.
 */

// Shadow DOM ignores @font-face: the icon font is declared on the document, from a file next to this script.
const FONT_FAMILY = 'Agentivity Material Icons';
const STYLES = graphStyles.replace(/@font-face\s*\{[^}]*\}/g, '');
const SCRIPT_URL = typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : '';

function ensureIconFont(): void {
  if (typeof document === 'undefined' || document.getElementById('agentivity-graph-font')) return;
  const url = SCRIPT_URL ? new URL('material-icons.woff2', SCRIPT_URL).href : 'material-icons.woff2';
  const style = document.createElement('style');
  style.id = 'agentivity-graph-font';
  style.textContent = `@font-face { font-family: '${FONT_FAMILY}'; font-style: normal; font-weight: 400; font-display: block; src: url('${url}') format('woff2'); }`;
  document.head.appendChild(style);
}

const HOST_STYLES = `
:host { display: block; width: 100%; color: var(--ag-on-surface, #1b1b26); }
:host([theme='dark']) {
  color: #e8e8f0;
  --ag-surface: #1b1b26;
  --ag-surface-container-low: #20202c;
  --ag-outline: #a4abbf;
  --ag-outline-variant: #3d4256;
}
:host([hidden]) { display: none; }
`;

const asBoolean = (value: string | null) => value !== null && value !== 'false';

export class AgentivityGraphElement extends HTMLElement {
  static observedAttributes = ['src', 'autoplay', 'interactive', 'step-ms', 'theme', 'camera'];

  #root?: Root;
  #source?: unknown;
  #fetched?: unknown;
  #message?: string;
  #loading = 0;

  /** The JSON to draw, set by script. Wins over `src`. */
  get source(): unknown {
    return this.#source;
  }
  set source(value: unknown) {
    this.#source = value;
    this.#render();
  }

  connectedCallback(): void {
    ensureIconFont();
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!this.#root) {
      const style = document.createElement('style');
      style.textContent = HOST_STYLES + STYLES;
      const mount = document.createElement('div');
      // So that a height given to the element reaches the frame of a workflow in `follow` mode.
      mount.style.height = '100%';
      shadow.append(style, mount);
      this.#root = createRoot(mount);
    }
    void this.#load();
    this.#render();
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = undefined;
    this.shadowRoot?.replaceChildren();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'src') void this.#load();
    else this.#render();
  }

  async #load(): Promise<void> {
    const src = this.getAttribute('src');
    if (!src) {
      this.#fetched = undefined;
      this.#message = undefined;
      return this.#render();
    }
    const ticket = ++this.#loading;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Could not load the graph (${response.status}).`);
      const json: unknown = await response.json();
      if (ticket !== this.#loading) return; // a newer src is on its way
      this.#fetched = json;
      this.#message = undefined;
      this.#render();
      this.dispatchEvent(new CustomEvent('agentivity-graph-ready'));
    } catch (error) {
      if (ticket !== this.#loading) return;
      this.#fetched = undefined;
      this.#message = error instanceof Error ? error.message : 'Could not load the graph.';
      this.#render();
      this.dispatchEvent(new CustomEvent('agentivity-graph-error', { detail: this.#message }));
    }
  }

  #render(): void {
    const root = this.#root;
    if (!root) return;
    const source = this.#source ?? this.#fetched;
    if (source === undefined) {
      root.render(this.#message ? <p className="ag-template-graph ag-template-graph--error" role="alert">{this.#message}</p> : null);
      return;
    }
    const stepMs = Number(this.getAttribute('step-ms'));
    root.render(
      <TemplateGraph
        source={source}
        autoplay={asBoolean(this.getAttribute('autoplay'))}
        interactive={asBoolean(this.getAttribute('interactive'))}
        stepMs={stepMs > 0 ? stepMs : undefined}
        camera={this.getAttribute('camera') === 'follow' ? 'follow' : 'fit'}
      />,
    );
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('agentivity-graph')) {
  customElements.define('agentivity-graph', AgentivityGraphElement);
}
