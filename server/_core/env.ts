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

  // ─── Tier 1-5 Service URLs ──────────────────────────────────────────────
  creditScoringUrl: process.env.CREDIT_SCORING_URL ?? "http://localhost:8100",
  fxRateFeedUrl: process.env.FX_RATE_FEED_URL ?? "http://localhost:8101",
  reconciliationEngineUrl: process.env.RECONCILIATION_ENGINE_URL ?? "http://localhost:8102",
  amlMonitorUrl: process.env.AML_MONITOR_URL ?? "http://localhost:8103",
  aiInsightsUrl: process.env.AI_INSIGHTS_URL ?? "http://localhost:8104",
  fraudHeatmapUrl: process.env.FRAUD_HEATMAP_URL ?? "http://localhost:8105",

  // ─── Tier 6-8 Service URLs ──────────────────────────────────────────────
  // Insurance premium collection
  insuranceServiceUrl: process.env.INSURANCE_SERVICE_URL ?? "http://localhost:8110",
  insuranceProviderUrl: process.env.INSURANCE_PROVIDER_URL ?? "https://api.leadway.com/v1",
  insuranceApiKey: process.env.INSURANCE_API_KEY ?? "",
  // Carbon credit marketplace
  carbonRegistryUrl: process.env.CARBON_REGISTRY_URL ?? "https://api.verra.org/v1",
  carbonApiKey: process.env.CARBON_API_KEY ?? "",
  // NFT loyalty badges
  nftServiceUrl: process.env.NFT_SERVICE_URL ?? "http://localhost:8111",
  nftRpcUrl: process.env.NFT_RPC_URL ?? "https://polygon-rpc.com",
  nftContractAddress: process.env.NFT_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  // BNPL v2 with credit bureau
  bnplV2ServiceUrl: process.env.BNPL_V2_SERVICE_URL ?? "http://localhost:8112",
  creditBureauUrl: process.env.CREDIT_BUREAU_URL ?? "https://api.crc.ng/v1",
  creditBureauApiKey: process.env.CREDIT_BUREAU_API_KEY ?? "",
  // Crypto on/off ramp
  cryptoRampUrl: process.env.CRYPTO_RAMP_URL ?? "http://localhost:8113",
  yellowCardApiUrl: process.env.YELLOW_CARD_API_URL ?? "https://api.yellowcard.io/v1",
  yellowCardApiKey: process.env.YELLOW_CARD_API_KEY ?? "",
  // Escrow service
  escrowServiceUrl: process.env.ESCROW_SERVICE_URL ?? "http://localhost:8114",
  // Bulk payment scheduler
  bulkSchedulerUrl: process.env.BULK_SCHEDULER_URL ?? "http://localhost:8115",
  // Tax withholding engine
  taxServiceUrl: process.env.TAX_SERVICE_URL ?? "http://localhost:8116",
  firsTinUrl: process.env.FIRS_TIN_URL ?? "https://api.firs.gov.ng/v1",
  firsApiKey: process.env.FIRS_API_KEY ?? "",
  // Regulatory sandbox
  regSandboxUrl: process.env.REG_SANDBOX_URL ?? "http://localhost:8117",
  cbnSandboxUrl: process.env.CBN_SANDBOX_URL ?? "https://sandbox.cbn.gov.ng/api/v1",
  cbnSandboxKey: process.env.CBN_SANDBOX_KEY ?? "",
  // Multi-currency wallet v2
  multiCurrencyUrl: process.env.MULTI_CURRENCY_URL ?? "http://localhost:8118",
  // RTGS (Real-Time Gross Settlement)
  rtgsUrl: process.env.RTGS_URL ?? "http://localhost:8119",
  nibssRtgsUrl: process.env.NIBSS_RTGS_URL ?? "https://rtgs.nibss-plc.com.ng/api/v1",
  nibssRtgsKey: process.env.NIBSS_RTGS_KEY ?? "",
  // ISO 20022 message bus
  iso20022Url: process.env.ISO20022_URL ?? "http://localhost:8120",
  swiftGpiUrl: process.env.SWIFT_GPI_URL ?? "https://api.swift.com/swift-apitracker/v4",
  swiftApiKey: process.env.SWIFT_API_KEY ?? "",
  // Open Finance Hub
  openFinanceUrl: process.env.OPEN_FINANCE_URL ?? "http://localhost:8121",
  openFinanceRegistryUrl: process.env.OPEN_FINANCE_REGISTRY_URL ?? "https://directory.openbanking.org.ng/v1",
  openFinanceApiKey: process.env.OPEN_FINANCE_API_KEY ?? "",
  // White-Label SDK
  whiteLabelSdkUrl: process.env.WHITE_LABEL_SDK_URL ?? "http://localhost:8122",
  sdkCdnUrl: process.env.SDK_CDN_URL ?? "https://cdn.paygate.ng/sdk",
  // Consumer Super App
  superAppUrl: process.env.SUPER_APP_URL ?? "http://localhost:8123",
  // Lakehouse v2
  lakehouseV2Url: process.env.LAKEHOUSE_V2_URL ?? "http://localhost:8124",
  deltaLakeUrl: process.env.DELTA_LAKE_URL ?? "http://localhost:8998",
  sparkThriftUrl: process.env.SPARK_THRIFT_URL ?? "jdbc:hive2://localhost:10000",
  // Payroll v2
  payrollV2Url: process.env.PAYROLL_V2_URL ?? "http://localhost:8125",
  pensionAdminUrl: process.env.PENSION_ADMIN_URL ?? "https://api.pencom.gov.ng/v1",
  pensionApiKey: process.env.PENSION_API_KEY ?? "",
  nhfUrl: process.env.NHF_URL ?? "https://api.fmbn.gov.ng/v1",
  nhfApiKey: process.env.NHF_API_KEY ?? "",
  // Settlement Forecast
  settlementForecastUrl: process.env.SETTLEMENT_FORECAST_URL ?? "http://settlement-forecast:9010",
  // Carbon Oracle
  carbonOracleUrl: process.env.CARBON_ORACLE_URL ?? "http://carbon-oracle:9011",
  // Insurance Pricing
  insurancePricingUrl: process.env.INSURANCE_PRICING_URL ?? "http://insurance-pricing:9012",
  // Tax Engine
  taxEngineUrl: process.env.TAX_ENGINE_URL ?? "http://tax-engine:9013",
  // ISO 20022 Parser
  iso20022ParserUrl: process.env.ISO20022_PARSER_URL ?? "http://iso20022-parser:9014",
};
