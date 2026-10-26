import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { AgentivityClient } from '../client/agentivity-client.js';
import { AgentivityPlatformClient } from '../client/platform-client.js';
import { WaitNotice, type WaitTexts } from '../chat/components/WaitNotice.js';

const AgentivityContext = createContext<AgentivityClient | undefined>(undefined);

export interface AgentivityProviderProps {
  /** An existing client instance, or a `baseUrl` to construct one from. */
  client?: AgentivityClient;
  baseUrl?: string;
  /** With `baseUrl`, on an instance that asks to sign in: a key for a web page (`agp_…`). Never a secret key (`agv_…`) in a page. */
  apiKey?: string;
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
export function AgentivityProvider({ client, baseUrl, apiKey, waitNotice, children }: AgentivityProviderProps): ReactNode {
  const resolved = useMemo(() => {
    if (client) return client;
    if (!baseUrl) {
      throw new Error('AgentivityProvider requires either `client` or `baseUrl`.');
    }
    return new AgentivityPlatformClient({ baseUrl, apiKey });
  }, [client, baseUrl, apiKey]);

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
