import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { verifySessionToken } from "./keycloak";
import * as db from "../db";
import { COOKIE_NAME } from "@shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  const map = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    map.set(key, val);
  }
  return map;
}

async function authenticateViaKeycloak(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  const session = await verifySessionToken(sessionCookie);
  if (!session) return null;

  const user = await db.getUserByOpenId(session.openId);
  if (!user) return null;

  // Touch last-seen asynchronously without blocking the request
  db.upsertUser({ openId: user.openId, lastSignedIn: new Date() }).catch(() => {});
  return user;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    if (ENV.keycloakUrl) {
      // Keycloak path: validate our own HS256 session cookie issued at /api/oauth/callback
      user = await authenticateViaKeycloak(opts.req);
    } else {
      // Manus OAuth path: delegate to the platform SDK (legacy / sandbox)
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
