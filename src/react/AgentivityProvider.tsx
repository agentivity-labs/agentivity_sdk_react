import { setArtifactInstanceUrl } from '../artifacts/components/ArtifactImage.js';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { AgentivityClient } from '../client/agentivity-client.js';
import { AgentivityPlatformClient } from '../client/platform-client.js';
import type { UserToken } from '../client/http-core.js';
import { WaitNotice, type WaitTexts } from '../chat/components/WaitNotice.js';

const AgentivityContext = createContext<AgentivityClient | undefined>(undefined);

export interface AgentivityProviderProps {
  /** An existing client instance, or a `baseUrl` to construct one from. */
  client?: AgentivityClient;
  baseUrl?: string;
  /** With `baseUrl`, on your server only: its API key (`agv_…`). Never in a page: a page speaks for its user or visitor (below). */
  apiKey?: string;
  /**
   * For the users of your system: asks your server, which keeps the API key, for the token of the user of the page (`agu_…`, see
   * `client.setUserToken`). Asked at the first request, then a minute before each token ends; each user has their own conversations.
   */
  getUserToken?: () => Promise<UserToken>;
  /**
   * For a demo (a showcase, a public page): asks the demo's server, which keeps the API key, for a new visitor
   * (`client.keys.visitor()` there). Each browser keeps its anonymous visitor between visits, with their own conversations.
   */
  getDemoVisitor?: () => Promise<UserToken>;
  /**
   * "Just a moment…" floating at the top while a call waits (`WaitNotice`): the first calls to a hosted workspace that wakes up take
   * most of a minute. On unless `false`; its words, where it floats and what "Try again" does can be given.
   */
  waitNotice?: false | { texts?: Partial<WaitTexts>; position?: 'top' | 'bottom'; onRetry?: () => void };
  children: ReactNode;
}

/**
 * Provides an {@link AgentivityClient} to the component tree. Pass either a
 * ready-made `client`, or a `baseUrl` and let the provider construct one
 * (memoized for the lifetime of the `baseUrl` value).
 *
 * ```tsx
 * <AgentivityProvider baseUrl="https://my-backend.example.com">
 *   <App />
 * </AgentivityProvider>
 * ```
 */
export function AgentivityProvider({ client, baseUrl, apiKey, getUserToken, getDemoVisitor, waitNotice, children }: AgentivityProviderProps): ReactNode {
  // The last functions given: a new one at each render does not make a new client.
  const tokenSource = useRef(getUserToken);
  tokenSource.current = getUserToken;
  const visitorSource = useRef(getDemoVisitor);
  visitorSource.current = getDemoVisitor;
  const asksTokens = getUserToken !== undefined;
  const asksVisitors = getDemoVisitor !== undefined;
  const resolved = useMemo(() => {
    let made = client;
    if (!made) {
      if (!baseUrl) {
        throw new Error('AgentivityProvider requires either `client` or `baseUrl`.');
      }
      made = new AgentivityPlatformClient({ baseUrl, apiKey });
    }
    if (asksTokens) made.setUserToken(null, () => tokenSource.current!());
    else if (asksVisitors) made.keys.visitDemo(() => visitorSource.current!());
    return made;
  }, [client, baseUrl, apiKey, asksTokens, asksVisitors]);
  // The pictures the instance keeps (a step's image in the chat) are read from it.
  setArtifactInstanceUrl(baseUrl ?? resolved.baseUrl);

  const notice = waitNotice === false ? undefined : (waitNotice ?? {});
  return (
    <AgentivityContext.Provider value={resolved}>
      {children}
      {notice && (
        <div className={`ag-wait-overlay__float ag-wait-overlay__float--${notice.position ?? 'top'}`}>
          <WaitNotice waiting={resolved.waiting} texts={notice.texts} onRetry={notice.onRetry} />
        </div>
      )}
    </AgentivityContext.Provider>
  );
}

/** Like {@link useAgentivityClient}, but `undefined` outside a provider — for widgets that can render without a backend and only need it for one feature. */
export function useOptionalAgentivityClient(): AgentivityClient | undefined {
  return useContext(AgentivityContext);
}

/** Reads the {@link AgentivityClient} provided by the nearest {@link AgentivityProvider}. */
export function useAgentivityClient(): AgentivityClient {
  const client = useContext(AgentivityContext);
  if (!client) {
    throw new Error('useAgentivityClient must be used within an <AgentivityProvider>.');
  }
  return client;
}
