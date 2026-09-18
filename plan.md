# Plan — Onboarding remediation + orphan-code gap closure

## Stage 1 — Discovery (2 parallel explore agents, background)
- A1 ORPHAN SCAN: find orphan code — routers never registered in server/routers.ts; exported
  functions/jobs never called; cron-worthy sweepers not registered in cronJobs.ts; schema tables
  never referenced; client pages never routed in App.tsx; REST endpoints unmounted. Evidence: file:line.
- A2 ONBOARDING INVENTORY: enumerate every onboarding/KYC router + procedure (wave223, onboardingRouter,
  complianceKycRouter, kyc.ts, partnerOnboarding, consumer onboarding) with current auth/scoping,
  to size the fix surface precisely.

## Stage 2 — Fixes (coder agents, disjoint ownership)
- W7 onboarding security: wave223_*.ts (owner+admin gates, ownership predicates, submit validation),
  onboardingRouter section of routers.ts (server-side completion gate), kyc sections (server-issued
  liveness verdicts, BVN blocking), KYC gate on money initiation. Migration 0105.
- W8 orphan closure: register/repair genuinely-needed orphans (routers, jobs); DELETE dead code only
  if never referenced and no route; never weaken tests. cronJobs.ts + routers.ts registration by lead.

## Stage 3 — Gates + delivery
tsc server/client, vitest new+regression, migration 0105 applied to paygate_monitor, snapshot,
commit, push via MCP API (PAT revoked), update PR #195 comment, final report.
