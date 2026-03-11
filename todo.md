# PayGate Merchant Portal — TODO

## Database

- [x] Switch driver from mysql2 to postgres (drizzle-orm/node-postgres)
- [x] Rewrite schema.ts with pgTable / pgEnum
- [x] Update drizzle.config.ts dialect to postgresql
- [x] Run pnpm db:push against PostgreSQL

## Middleware Gap Closure

- [x] TigerBeetle: Rust client crate with CGo FFI bridge
- [x] TigerBeetle: add `tigerbeetle-go` to go.mod with CGo support
- [x] Go bridge: write `cmd/bridge/main.go` entry point
- [x] Go bridge: Dockerfile for bridge sidecar
- [x] Portal: import middlewareRouter into server/routers.ts
- [x] Portal: add MIDDLEWARE_BRIDGE_URL env var

## Backend tRPC Procedures

- [x] transactions: list, get, create, stats
- [x] customers: list, get, create, stats
- [x] payouts: list, get, create, approve
- [x] analytics: overview, revenue, volume, fraud
- [x] apiKeys: list, create, revoke
- [x] webhooks: list, create, delete, test
- [x] disputes: list, get, submit, respond
- [x] virtualCards: list, create, freeze, unfreeze
- [x] paymentLinks: list, create, deactivate
- [x] settings: get, update (business, bank, notifications)
- [x] team: list members, invite, update role, remove
- [x] onboarding: getStatus, completeStep

## PWA

- [x] Generate all 8 icon sizes (72–512px)
- [x] Upload icons to CDN
- [x] Fix manifest.webmanifest icon paths
- [x] Verify service worker offline page

## Mobile App

- [x] Update API base URL to portal backend
- [x] Implement JWT auth flow (login → token → storage)
- [x] Wire transactions screen to live API
- [x] Wire dashboard screen to live API

## Demo Data Seed
- [x] Write seed.mjs script with realistic merchants, customers, transactions, payouts, disputes, API keys, webhooks
- [x] Run seed against local PostgreSQL
- [x] Verify all dashboard pages render with data

## Production Secrets
- [x] Request DATABASE_URL (PostgreSQL production connection string)
- [x] Request MIDDLEWARE_BRIDGE_URL (Go sidecar URL)
- [x] Request MIDDLEWARE_INTERNAL_KEY (shared secret for bridge auth)

## Expanded Test Suite
- [x] transactions.list — pagination, filtering by status/date
- [x] payouts.create — validates amount, currency, bank details
- [x] onboarding.createMerchant — creates merchant + sets onboarding step
- [x] customers.list — returns paginated customer list
- [x] apiKeys.create / revoke — full lifecycle test
