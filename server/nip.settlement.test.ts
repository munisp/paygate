/**
 * Tests for the CBN NIP bank directory and account name enquiry.
 *
 * REWRITE (de-theatered): the previous version asserted on an inline copy of
 * the bank list, a `simulateNipNameEnquiry` function returning fabricated
 * names from a hardcoded array, and an inline SLA-breach re-implementation —
 * none of which exercised real code. This version drives the REAL
 * nipBanksRouter procedures (server/routers/nipBanks.ts) with only the
 * Postgres connection faked.
 *
 * Removed: the Settlement SLA describes. The real SLA monitor
 * (server/cronJobs.ts checkSettlementSLA) is module-private and not exported,
 * so there is no real surface to test without a production change (reported).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  nipBanks as nipBanksTable,
  nipNameEnquiryCache as nipNameEnquiryCacheTable,
} from "../drizzle/schema";

// ─── Fake Postgres (only the connection; the router under test is real) ──────
type BankRow = {
  id: string; bankCode: string; bankName: string; shortName: string;
  nipCode: string; category: string; isActive: number;
};
let banks: BankRow[];
let enquiryCache: any[];

/** Extract embedded param values from a drizzle SQL condition object. */
function conditionParams(cond: any): any[] {
  const params: any[] = [];
  const walk = (c: any) => {
    if (c == null) return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (typeof c === "object") {
      if ("queryChunks" in c) return walk(c.queryChunks);
      if (Array.isArray(c.value)) return walk(c.value);
      if ("value" in c) return walk(c.value);
      return;
    }
    params.push(c);
  };
  walk(cond);
  return params;
}

const CATEGORIES = new Set(["commercial", "microfinance", "merchant", "digital", "non_interest", "mobile_money"]);

vi.mock("./db", async (importOriginal) => {
  const orig = await importOriginal<any>();
  const conn: any = {
    select: () => ({
      from: (table: any) => {
        if (table === nipNameEnquiryCacheTable) {
          return {
            where: (cond: any) => ({
              limit: async (n: number) => {
                const params = conditionParams(cond);
                return enquiryCache
                  .filter((r) => params.includes(r.bankNipCode) && params.includes(r.accountNumber))
                  .filter((r) => r.expiresAt > new Date())
                  .slice(0, n);
              },
            }),
          };
        }
        // nipBanks list: $dynamic().where(conditions).orderBy(bankName)
        let filtered = banks;
        const builder: any = {
          $dynamic: () => builder,
          where: (cond: any) => {
            const params = conditionParams(cond);
            const search = params.find((p) => typeof p === "string" && p.startsWith("%"));
            const category = params.find((p) => typeof p === "string" && CATEGORIES.has(p));
            filtered = banks.filter((b) => b.isActive === 1);
            if (category) filtered = filtered.filter((b) => b.category === category);
            if (search) {
              const term = search.replaceAll("%", "").toLowerCase();
              filtered = filtered.filter((b) =>
                b.bankName.toLowerCase().includes(term) ||
                b.shortName.toLowerCase().includes(term) ||
                b.nipCode.includes(term));
            }
            return builder;
          },
          orderBy: async () =>
            [...filtered].sort((a, b) => a.bankName.localeCompare(b.bankName)),
        };
        return builder;
      },
    }),
  };
  return { ...orig, db: Promise.resolve(conn), getDb: async () => conn };
});

import { nipBanksRouter } from "./routers/nipBanks";
import type { TrpcContext } from "./_core/context";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "tester", email: "t@test.com", name: "Tester", role: "admin",
      loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    req: { headers: {}, protocol: "https" } as any,
    res: {} as any,
  };
}

// Mirrors the shape (not the contents) of scripts/seed-nip-banks.mjs rows.
function seedBanks() {
  banks = [
    { id: "b1", bankCode: "044", bankName: "Access Bank Plc", shortName: "Access Bank", nipCode: "044", category: "commercial", isActive: 1 },
    { id: "b2", bankCode: "058", bankName: "Guaranty Trust Bank Limited", shortName: "GTBank", nipCode: "058", category: "commercial", isActive: 1 },
    { id: "b3", bankCode: "057", bankName: "Zenith Bank Plc", shortName: "Zenith Bank", nipCode: "057", category: "commercial", isActive: 1 },
    { id: "b4", bankCode: "033", bankName: "United Bank for Africa Plc", shortName: "UBA", nipCode: "033", category: "commercial", isActive: 1 },
    { id: "b5", bankCode: "011", bankName: "First Bank of Nigeria Limited", shortName: "FirstBank", nipCode: "011", category: "commercial", isActive: 1 },
    { id: "b6", bankCode: "090110", bankName: "VFD Microfinance Bank", shortName: "VFD MFB", nipCode: "090110", category: "microfinance", isActive: 1 },
    { id: "b7", bankCode: "090999", bankName: "Dormant Bank Ltd", shortName: "Dormant", nipCode: "090999", category: "commercial", isActive: 0 },
  ];
}

describe("nipBanks.list — real procedure over the bank directory", () => {
  beforeEach(() => { seedBanks(); enquiryCache = []; });

  it("returns active banks sorted by name (activeOnly default)", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    const rows = await caller.list({});
    expect(rows.every((b: BankRow) => b.isActive === 1)).toBe(true);
    expect(rows.find((b: BankRow) => b.bankCode === "090999")).toBeUndefined(); // inactive excluded
    const names = rows.map((b: BankRow) => b.bankName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("filters by search term across bankName/shortName/nipCode (real ilike)", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    const byName = await caller.list({ search: "guaranty" });
    expect(byName).toHaveLength(1);
    expect(byName[0].bankCode).toBe("058");
    const byShort = await caller.list({ search: "uba" });
    expect(byShort.map((b: BankRow) => b.bankCode)).toEqual(["033"]);
    const byNip = await caller.list({ search: "090110" });
    expect(byNip.map((b: BankRow) => b.bankName)).toEqual(["VFD Microfinance Bank"]);
  });

  it("filters by category", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    const mfb = await caller.list({ category: "microfinance" });
    expect(mfb.map((b: BankRow) => b.bankCode)).toEqual(["090110"]);
    const commercial = await caller.list({ category: "commercial" });
    expect(commercial.every((b: BankRow) => b.category === "commercial")).toBe(true);
  });
});

describe("nipBanks.nameEnquiry — real validation, cache, and fail-loud gateway", () => {
  beforeEach(() => { seedBanks(); enquiryCache = []; });

  it("rejects account numbers that are not exactly 10 digits (real zod schema)", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    await expect(
      caller.nameEnquiry({ bankNipCode: "000044", accountNumber: "123456789" }), // 9 digits
    ).rejects.toThrow();
    await expect(
      caller.nameEnquiry({ bankNipCode: "000044", accountNumber: "01234567890" }), // 11 digits
    ).rejects.toThrow();
    await expect(
      caller.nameEnquiry({ bankNipCode: "000044", accountNumber: "012345678A" }),
    ).rejects.toThrow();
  });

  it("rejects bank NIP codes shorter than 6 characters", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    await expect(
      caller.nameEnquiry({ bankNipCode: "044", accountNumber: "0123456789" }),
    ).rejects.toThrow();
  });

  // PRODUCTION BUG (reported, not fixed): server/routers/nipBanks.ts imports
  // `nipNameEnquiryCache` from drizzle/schema, but that table is not defined
  // (or exported) anywhere in drizzle/. The import is `undefined`, so
  // nameEnquiry crashes with "Cannot read properties of undefined" on the
  // cache-read line for EVERY call — including cache hits. This `it.fails`
  // pins the correct contract and flips green once the table is added.
  it.fails("serves a cached enquiry from the DB cache (fromCache: true) without NIBSS", async () => {
    enquiryCache.push({
      bankNipCode: "000044", accountNumber: "0123456789",
      accountName: "ADEBAYO OLUWASEUN", bankVerificationNumber: null, kycLevel: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const caller = nipBanksRouter.createCaller(makeCtx());
    const res = await caller.nameEnquiry({ bankNipCode: "000044", accountNumber: "0123456789" });
    expect(res).toMatchObject({ accountName: "ADEBAYO OLUWASEUN", fromCache: true });
  });

  it("fails loud on a cache miss with no gateway configured — never fabricates a name", async () => {
    const caller = nipBanksRouter.createCaller(makeCtx());
    // No NIBSS_GATEWAY_URL / MIDDLEWARE_BRIDGE_URL in the test env: the real
    // implementation must throw, not invent an account name. (NB: today it
    // throws earlier than intended — see the nipNameEnquiryCache production
    // bug above — but it must never fabricate a name.)
    await expect(
      caller.nameEnquiry({ bankNipCode: "000044", accountNumber: "0123456789" }),
    ).rejects.toThrow();
  });
});
