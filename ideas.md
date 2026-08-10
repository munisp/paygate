# PayGate Gateway & Workflow Monitor — Design Ideas

## Approach 1: Obsidian Operations (CHOSEN — probability: 0.04)
Deep slate base with electric cyan accents. Inspired by Datadog, Grafana, and incident command centers. Fixed sidebar, dense tables, monospace metrics, animated status pulses.

## Approach 2: Signal Green (probability: 0.03)
High-contrast dark green terminal aesthetic. CRT-inspired glow, scanline textures, very technical.

## Approach 3: Midnight Blueprint (probability: 0.02)
Navy + amber engineering blueprint style. Grid backgrounds, technical annotations, architectural feel.

---

## Chosen Approach: Obsidian Operations

**Design Movement:** Dark SaaS Ops Console (Datadog/Grafana lineage)
**Core Principles:** Information density over whitespace; monospace as primary type; status-first hierarchy; every surface communicates operational state.
**Color Philosophy:** Deep slate (`oklch(0.13)`) base, electric cyan (`oklch(0.72 0.18 200)`) as the single ownable accent, emerald for nominal, amber for degraded, crimson for critical.
**Layout Paradigm:** Fixed left sidebar + asymmetric 2/3 primary data + 1/3 live status rail. No centered layouts.
**Signature Elements:** Animated pulse rings on live indicators; cyan left-border on active nav; monospace metric values; edge-lit cards with subtle cyan inner glow.
**Interaction Philosophy:** Instant feedback, no decorative animations. Operational actions (terminate, cancel) require confirmation dialogs.
**Animation:** `card-enter` 180ms ease-out for data rows; `animate-ping` for live status dots; `animate-spin` for running workflow icons.
**Typography System:** JetBrains Mono for all metrics, IDs, paths, headings, and labels. Inter for body/supporting text only.
**Brand Essence:** PayGate Ops — the nerve center for payment infrastructure engineers.
**Brand Voice:** Telemetry and incident language. "SYSTEM TELEMETRY", "INCIDENT QUEUE", "Live Executions" — never "Welcome" or "Get started".
**Signature Brand Color:** Electric cyan `oklch(0.72 0.18 200)`.

## Style Decisions
- Every desktop screen uses asymmetric layout: 2/3 primary data + 1/3 live status rail.
- Top bar always shows global health status pill and live workflow count.
- All headings use JetBrains Mono in uppercase tracking-widest — telemetry language only.
- Cards use subtle gradient backgrounds and cyan inner-glow borders.
- Sidebar shows live system state summary (gateway/workflows/incidents) at the bottom.
