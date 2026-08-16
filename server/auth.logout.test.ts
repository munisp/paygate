import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    // STALE CONTRACT: auth.logout now also returns `ssoLogoutUrl` (null when
    // no SSO end-session endpoint is configured) so clients can complete
    // single logout.
    expect(result).toEqual({ success: true, ssoLogoutUrl: null });
    // STALE CONTRACT: logout clears THREE cookies — the portal session cookie
    // plus the Keycloak id_token and refresh_token cookies. Leaving either
    // token cookie alive lets a shared/kiosk browser silently re-authenticate.
    expect(clearedCookies).toHaveLength(3);
    const byName = new Map(clearedCookies.map((c) => [c.name, c]));
    const session = byName.get(COOKIE_NAME);
    expect(session).toBeDefined();
    expect(session?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
    const idToken = byName.get("paygate_id_token");
    expect(idToken?.options).toMatchObject({ maxAge: -1 });
    const refreshToken = byName.get("paygate_refresh_token");
    expect(refreshToken?.options).toMatchObject({ maxAge: -1, path: "/api/auth" });
  });
});
