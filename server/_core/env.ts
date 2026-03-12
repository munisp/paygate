export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Go middleware bridge — used for payout approval workflow orchestration.
  // When empty (local dev / sandbox), the portal falls back to direct DB
  // operations so the UI remains fully functional without the bridge running.
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
};
