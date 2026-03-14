export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Go middleware bridge
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",

  // TigerBeetle ledger
  tigerbeetleAddress: process.env.TIGERBEETLE_ADDRESS ?? "127.0.0.1:3902",

  // Keycloak OIDC
  keycloakUrl: process.env.KEYCLOAK_URL ?? "",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "paygate",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "merchant-portal",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",

  // gRPC services
  grpcBridgeUrl: process.env.GRPC_BRIDGE_URL ?? "localhost:50051",
  grpcFraudUrl: process.env.GRPC_FRAUD_URL ?? "localhost:50052",
  grpcNotifyUrl: process.env.GRPC_NOTIFY_URL ?? "localhost:50053",
  grpcOutboxUrl: process.env.GRPC_OUTBOX_URL ?? "localhost:50054",
  grpcUssdUrl: process.env.GRPC_USSD_URL ?? "localhost:50055",
  outboxRelayGrpcUrl: process.env.OUTBOX_RELAY_GRPC_URL ?? "localhost:50056",
  ussdServiceGrpcUrl: process.env.USSD_SERVICE_GRPC_URL ?? "localhost:50057",

  // Push notification service
  pushServiceUrl: process.env.PUSH_SERVICE_URL ?? "http://localhost:8096",
  pushServiceGrpcUrl: process.env.PUSH_SERVICE_GRPC_URL ?? "localhost:50058",
  pushServiceKey: process.env.PUSH_SERVICE_KEY ?? "",

  // Sync relay (offline POS / consumer app)
  syncRelayUrl: process.env.SYNC_RELAY_URL ?? "http://localhost:8097",
  syncRelayKey: process.env.SYNC_RELAY_KEY ?? "",

  // SLA escalation
  slaEscalationIntervalMs: parseInt(process.env.SLA_ESCALATION_INTERVAL_MS ?? "60000", 10),
  slaEscalationThresholdMs: parseInt(process.env.SLA_ESCALATION_THRESHOLD_MS ?? "86400000", 10),

  // Rust microservices
  inventoryEngineUrl: process.env.INVENTORY_ENGINE_URL ?? "http://localhost:8091",
  loyaltyLedgerUrl: process.env.LOYALTY_LEDGER_URL ?? "http://localhost:8092",

  // Python microservices
  payrollServiceUrl: process.env.PAYROLL_SERVICE_URL ?? "http://localhost:8093",
  kioskHealthUrl: process.env.KIOSK_HEALTH_URL ?? "http://localhost:8094",
  fraudScoringUrl: process.env.FRAUD_SCORING_URL ?? "http://localhost:8083",
  ussdGatewayUrl: process.env.USSD_GATEWAY_URL ?? "http://localhost:8095",

  // PostgreSQL direct connection (Go bridge / Rust crate)
  pgDatabaseUrl: process.env.PG_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
};
