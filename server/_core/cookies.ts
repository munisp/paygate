import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/** Cookie name for the short-lived Keycloak id_token used as id_token_hint on logout. */
export const ID_TOKEN_COOKIE_NAME = "paygate_id_token";

/**
 * Cookie name for the Keycloak refresh_token.
 *
 * Stored as a long-lived httpOnly cookie so the portal can silently re-issue
 * the session JWT when the Keycloak access token expires (default 5 min),
 * without requiring the user to re-authenticate.
 */
export const REFRESH_TOKEN_COOKIE_NAME = "paygate_refresh_token";

/**
 * Cookie options for the Keycloak refresh_token cookie.
 *
 * The refresh token is long-lived (default 30 days = Keycloak offline session
 * idle timeout). It is httpOnly so it cannot be read from JavaScript.
 * The /api/auth/refresh endpoint reads it server-side to exchange for a new
 * access token and re-issue the portal session JWT.
 */
export function getRefreshTokenCookieOptions(
  req: Request,
  expiresInSeconds = 2592000 // 30 days — matches Keycloak offline session idle timeout
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure" | "maxAge"> {
  return {
    httpOnly: true,
    path: "/api/auth", // restrict to auth endpoints only
    sameSite: "none",
    secure: isSecureRequest(req),
    maxAge: expiresInSeconds * 1000,
  };
}

/**
 * Cookie options for the Keycloak id_token cookie.
 *
 * This cookie is stored separately from the session cookie and is used
 * exclusively as the `id_token_hint` parameter on the Keycloak end-session
 * endpoint — it skips the "do you want to log out?" confirmation page.
 *
 * The cookie is:
 *   - httpOnly: not accessible from JavaScript
 *   - short-lived: maxAge matches the Keycloak access token expiry (default 5 min)
 *   - cleared on logout alongside the session cookie
 */
export function getIdTokenCookieOptions(
  req: Request,
  expiresInSeconds = 300
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure" | "maxAge"> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
    maxAge: expiresInSeconds * 1000,
  };
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
