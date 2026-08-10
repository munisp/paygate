/**
 * pgSetupFile.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vitest setupFile that activates the pg-mem mock for all test files.
 * Referenced in vitest.config.ts as `setupFiles: ['./server/pgSetupFile.ts']`
 *
 * When this file calls `vi.mock('pg')`, Vitest uses the manual mock at
 * `__mocks__/pg.ts` (relative to the project root) for all subsequent imports
 * of `pg` in the test worker.
 */
import { vi } from "vitest";

// Activate the manual mock at __mocks__/pg.ts
vi.mock("pg");
