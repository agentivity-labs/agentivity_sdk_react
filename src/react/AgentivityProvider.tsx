import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { AgentivityClient } from '../client/agentivity-client.js';
import { AgentivityPlatformClient } from '../client/platform-client.js';

const AgentivityContext = createContext<AgentivityClient | undefined>(undefined);

export interface AgentivityProviderProps {
  /** An existing client instance, or a `baseUrl` to construct one from. */
  client?: AgentivityClient;
  baseUrl?: string;
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
export function AgentivityProvider({ client, baseUrl, children }: AgentivityProviderProps): ReactNode {
  const resolved = useMemo(() => {
    if (client) return client;
    if (!baseUrl) {
      throw new Error('AgentivityProvider requires either `client` or `baseUrl`.');
    }
    return new AgentivityPlatformClient({ baseUrl });
  }, [client, baseUrl]);

  return <AgentivityContext.Provider value={resolved}>{children}</AgentivityContext.Provider>;
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
