import { AgentivityHttpCore, type UserToken } from '../http-core.js';

/** A person of the instance, signed in through an App. */
export interface AppSignedIn {
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
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
 * The users of an App, each with their own conversations.
 *
 * - The App's own users: the App's **server** gets a token for each (`POST /api/v1/apps/{id}/user-tokens` with its secret, never
 *   from a page), and the page gives it with `client.setUserToken(token, renew)`, `renew` asking its server for the next one.
 * - People of the instance (an internal app): they sign in through the App ({@link signIn}); the client then renews their token
 *   itself while their session lasts, and {@link signOut} ends it.
 * - Visitors of a demo: anonymous, each page gets one of its own ({@link visitDemo}), kept by the browser while the demo keeps
 *   what they start.
 */
export class AppsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /**
   * Signs a person of the instance in through the App `appId`: from now on the client speaks for them, and renews their token
   * while their session lasts. POST /api/v1/apps/{appId}/sign-in
   */
  async signIn(args: { appId: string; email: string; password: string }): Promise<AppSignedIn> {
    // Signing in goes with nothing: neither a key nor the token of whoever the client spoke for before.
    const signedIn = await this.c.post<AppSignedIn>(this.path(args.appId, '/sign-in'), { email: args.email, password: args.password }, { headers: { Authorization: '' } });
    this.c.setUserToken(signedIn, () => this.renew(args.appId));
    return signedIn;
  }

  /** Signs out of the App: its session and its tokens end, and the client speaks for no one. POST /api/v1/apps/{appId}/sign-out */
  async signOut(appId: string): Promise<void> {
    const token = this.c.currentUserToken;
    this.c.setUserToken(null);
    if (token) await this.c.post<unknown>(this.path(appId, '/sign-out'), undefined, { headers: { Authorization: `Bearer ${token}` } });
  }

  /** The next token of the person signed in through the App, while their session lasts. POST /api/v1/apps/{appId}/user-tokens/renew */
  renew(appId: string): Promise<UserToken> {
    const token = this.c.currentUserToken;
    return this.c.post<UserToken>(this.path(appId, '/user-tokens/renew'), undefined, { headers: { Authorization: `Bearer ${token ?? ''}` } });
  }

  /**
   * Speaks for a visitor of the demo App `appId`: the one this browser already has, or a new one. The visitor is kept (in
   * `storage`, localStorage unless said) for the days the demo keeps what they start, so that they find their conversations
   * again; a new one is asked when it ends or is refused. POST /api/v1/apps/{appId}/visitors
   */
  visitDemo(appId: string, storage: VisitorStorage | undefined = browserStorage()): void {
    const key = `agentivity.visitor.${appId}`;
    const kept = (): UserToken | undefined => {
      try {
        const raw = storage?.getItem(key);
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
      const given = await this.c.post<UserToken>(this.path(appId, '/visitors'), undefined, { headers: { Authorization: '' } });
      try {
        storage?.setItem(key, JSON.stringify({ token: given.token, expiresAt: given.expiresAt }));
      } catch {
        // A browser that keeps nothing: the visitor lasts as long as the page.
      }
      return given;
    });
  }

  private path(appId: string, rest: string): string {
    return AgentivityHttpCore.v1(`/apps/${encodeURIComponent(appId)}${rest}`);
  }
}
