import { AgentivityHttpCore, type UserToken } from '../http-core.js';

/** A person of the workspace, signed in through a system whose API key lets its people in. */
export interface KeySignedIn {
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
}

/** A visitor of a demo, given to the demo's server: their token, for their browser, and who they are. */
export interface DemoVisitor extends UserToken {
  visitorId: string;
}

/** Where a page keeps its visitor of a demo between visits: the browser's localStorage unless said. */
export interface VisitorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): VisitorStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The users of an API key, each with their own conversations. A key lives on a server, never in a page: its server asks the
 * instance for its users' tokens, and its pages speak for them with those.
 *
 * On the server (a client made with `apiKey`):
 * - the users of your system: {@link userToken} gets a token for each, which the page gives with `client.setUserToken(token, renew)`;
 * - the visitors of a demo: {@link visitor} gets one for each new page.
 *
 * In the page:
 * - people of the workspace sign in through the key ({@link signIn}); the client renews their token while their session lasts,
 *   and {@link signOut} ends it;
 * - a demo keeps its visitor between visits ({@link visitDemo}), asked of its server.
 */
export class KeysApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /**
   * On your server, with the key: a token for a user of your system, worth a few minutes. `userId` is their id in your system,
   * the same each time, so that they find their conversations. POST /api/v1/keys/user-tokens
   */
  userToken(args: { userId: string; name?: string; email?: string }): Promise<UserToken> {
    return this.c.post<UserToken>(AgentivityHttpCore.v1('/keys/user-tokens'), args);
  }

  /** On the demo's server, with the key: a new anonymous visitor, with the token their browser keeps. POST /api/v1/keys/visitors */
  visitor(): Promise<DemoVisitor> {
    return this.c.post<DemoVisitor>(AgentivityHttpCore.v1('/keys/visitors'), undefined);
  }

  /**
   * Signs a person of the workspace in through the key `keyId` (its id, never the key): from now on the client speaks for them,
   * and renews their token while their session lasts. POST /api/v1/keys/{keyId}/sign-in
   */
  async signIn(args: { keyId: string; email: string; password: string }): Promise<KeySignedIn> {
    // Signing in goes with nothing: neither a key nor the token of whoever the client spoke for before.
    const signedIn = await this.c.post<KeySignedIn>(this.path(args.keyId, '/sign-in'), { email: args.email, password: args.password }, { headers: { Authorization: '' } });
    this.c.setUserToken(signedIn, () => this.renew(args.keyId));
    return signedIn;
  }

  /** Signs out: the session and its tokens end, and the client speaks for no one. POST /api/v1/keys/{keyId}/sign-out */
  async signOut(keyId: string): Promise<void> {
    const token = this.c.currentUserToken;
    this.c.setUserToken(null);
    if (token) await this.c.post<unknown>(this.path(keyId, '/sign-out'), undefined, { headers: { Authorization: `Bearer ${token}` } });
  }

  /** The next token of the person signed in through the key, while their session lasts. POST /api/v1/keys/{keyId}/user-tokens/renew */
  renew(keyId: string): Promise<UserToken> {
    const token = this.c.currentUserToken;
    return this.c.post<UserToken>(this.path(keyId, '/user-tokens/renew'), undefined, { headers: { Authorization: `Bearer ${token ?? ''}` } });
  }

  /**
   * In the page of a demo: speaks for the visitor this browser already has, or a new one that `getVisitor` asks of the demo's
   * server (which keeps the key and calls {@link visitor}). The visitor is kept (in `storage`, localStorage unless said) for the
   * days the demo keeps what they start, so that they find their conversations again; a new one is asked when it ends or is refused.
   */
  visitDemo(getVisitor: () => Promise<UserToken>, storage: VisitorStorage | undefined = browserStorage(), storageKey = 'agentivity.visitor'): void {
    const kept = (): UserToken | undefined => {
      try {
        const raw = storage?.getItem(storageKey);
        const token = raw ? (JSON.parse(raw) as UserToken) : undefined;
        return token?.token && (token.expiresAt === undefined || Date.parse(String(token.expiresAt)) - Date.now() > 60_000) ? token : undefined;
      } catch {
        return undefined;
      }
    };
    this.c.setUserToken(null, async () => {
      // The one kept serves, unless it is the one the client now asks to replace (past its end, or refused).
      const known = kept();
      if (known && known.token !== this.c.currentUserToken) return known;
      const given = await getVisitor();
      try {
        storage?.setItem(storageKey, JSON.stringify({ token: given.token, expiresAt: given.expiresAt }));
      } catch {
        // A browser that keeps nothing: the visitor lasts as long as the page.
      }
      return given;
    });
  }

  private path(keyId: string, rest: string): string {
    return AgentivityHttpCore.v1(`/keys/${encodeURIComponent(keyId)}${rest}`);
  }
}
