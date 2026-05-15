/**
 * tRPC request context builder.
 *
 * Authentication is Keycloak-only (on-premise compatible).
 * The session cookie is an HS256 JWT issued by our own server after the
 * Keycloak Authorization Code callback — no outbound cloud call is made
 * per request.
 *
 * If KEYCLOAK_URL is not set (local dev without Keycloak), the email/password
 * login path (auth.login tRPC procedure) still works because it also issues
 * the same HS256 session cookie format via createSessionToken().
 */
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
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

async function authenticateRequest(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);

  // verifySessionToken validates our own HS256 JWT — no cloud call needed.
  // Works whether the session was issued after Keycloak OIDC callback
  // or after the email/password login path (auth.login tRPC procedure).
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
    user = await authenticateRequest(opts.req);
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
