/**
 * splitPayments.test.ts — split validation, flat vs percentage math with the
 * deterministic remainder rule, transaction_charge override, bearer modes,
 * dynamic split preview, and recordSplitSettlement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  groups: new Map<string, any>(),
  members: new Map<string, any[]>(), // groupId -> members
  settlements: [] as any[],
  events: [] as any[],
  merchant: { id: 'merch_1', ownerId: 99 } as any,
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...vals: any[]) => {
    // Flatten nested sql`` fragments so handlers see all bound values in order.
    const flat = (vs: any[]): any[] =>
      vs.flatMap((v) => (v && typeof v === 'object' && 'text' in v ? flat(v.values) : [v]));
    return { text: (strings as unknown as string[]).join('¤'), values: flat(vals) };
  },
}));

vi.mock('../../server/db', () => {
  const execute = async (q: { text: string; values: any[] }) => {
    const t = q.text.trim();
    const v = q.values;
    if (t.includes('FROM split_groups') && t.includes('AND (id =')) {
      const [merchantId, idOrCode] = v;
      const g = [...h.groups.values()].find(
        (x) => x.merchant_id === merchantId && (x.id === idOrCode || x.split_code === idOrCode));
      return { rows: g ? [g] : [] };
    }
    if (t.startsWith('SELECT * FROM split_group_members')) {
      return { rows: [...(h.members.get(v[0]) ?? [])] };
    }
    if (t.startsWith('INSERT INTO split_groups')) {
      const [id, merchant_id, name, split_code, type, currency,
        bearer_type, bearer_subaccount_id, active, created_at, updated_at] = v;
      const row = { id, merchant_id, name, split_code, type, currency,
        bearer_type, bearer_subaccount_id, active, created_at, updated_at };
      h.groups.set(id, row);
      h.members.set(id, []);
      return { rows: [row] };
    }
    if (t.startsWith('INSERT INTO split_group_members')) {
      const [id, group_id, subaccount_ref, share, created_at] = v;
      const list = h.members.get(group_id) ?? [];
      const existing = list.find((m) => m.subaccount_ref === subaccount_ref);
      if (existing) existing.share = share; // ON CONFLICT DO UPDATE
      else list.push({ id, group_id, subaccount_ref, share, created_at });
      h.members.set(group_id, list);
      return { rows: [] };
    }
    if (t.startsWith('UPDATE split_groups SET\n          name')) {
      const [name, active, bearer_type, bearer_subaccount_id, , id, merchantId] = v;
      const g = h.groups.get(id);
      if (!g || g.merchant_id !== merchantId) return { rows: [] };
      Object.assign(g, { name, active, bearer_type, bearer_subaccount_id });
      return { rows: [{ ...g }] };
    }
    if (t.startsWith('UPDATE split_groups SET active = false')) {
      const g = h.groups.get(v[1]);
      if (g) g.active = false;
      return { rows: [] };
    }
    if (t.startsWith('DELETE FROM split_group_members')) {
      const [groupId, ref] = v;
      h.members.set(groupId, (h.members.get(groupId) ?? []).filter((m) => m.subaccount_ref !== ref));
      return { rows: [] };
    }
    if (t.includes('FROM split_groups') && t.includes('ORDER BY id ASC')) {
      // listGroups
      return { rows: [...h.groups.values()].filter((g) => g.merchant_id === v[0]) };
    }
    if (t.startsWith('INSERT INTO split_payments')) {
      const [split_payment_id, split_rule_id, merchant_id, split_code,
        total_amount_kobo, reference, legs, status, created_at, updated_at] = v;
      h.settlements.push({ split_payment_id, split_rule_id, merchant_id, split_code,
        total_amount_kobo, reference, legs, status, created_at, updated_at });
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${t.slice(0, 90)}`);
  };
  return {
    getDb: vi.fn(async () => ({ execute })),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === 'open_7' ? { id: 7, openId } : null),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
  };
});

vi.mock('../../server/webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (p: any) => { h.events.push(p); return { dispatched: 1, failed: 0 }; }),
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  splitEngineRouter, applySplit, validatePercentageSum, recordSplitSettlement,
} from './splitPayments';

const ctx: any = {
  user: { id: 7, openId: 'open_7', role: 'user' },
  req: { headers: {} },
  res: {},
};
const makeCaller = (c: any = ctx) => splitEngineRouter.createCaller(c);

const sumNet = (r: { allocations: { netKobo: number }[] }) =>
  r.allocations.reduce((a, x) => a + x.netKobo, 0);

beforeEach(() => {
  h.groups.clear();
  h.members.clear();
  h.settlements.length = 0;
  h.events.length = 0;
  h.merchant = { id: 'merch_1', ownerId: 99 };
});

// ─── Pure math ────────────────────────────────────────────────────────────────
describe('applySplit math', () => {
  it('percentage: floors sub shares, main absorbs the remainder; sum is exact', () => {
    const r = applySplit({
      amountKobo: 100_003, type: 'percentage', bearerType: 'account',
      subaccounts: [
        { ref: 'A', share: 5000 }, // 50000.15 → 50000
        { ref: 'B', share: 3000 }, // 30000.09 → 30000
        { ref: 'C', share: 2000 }, // 20000.06 → 20000
      ],
    });
    // floor(100003*0.5)=50001, floor(100003*0.3)=30000, floor(100003*0.2)=20000; main absorbs 2k
    expect(r.allocations.map((a) => [a.ref, a.netKobo])).toEqual([
      ['A', 50_001], ['B', 30_000], ['C', 20_000], ['MAIN', 2],
    ]);
    expect(sumNet(r)).toBe(100_003);
  });

  it('flat: shares are raw kobo; main keeps the remainder', () => {
    const r = applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'account',
      subaccounts: [{ ref: 'A', share: 1000 }, { ref: 'B', share: 2000 }],
    });
    expect(r.allocations.map((a) => [a.ref, a.netKobo])).toEqual([
      ['A', 1000], ['B', 2000], ['MAIN', 7000],
    ]);
  });

  it('rejects flat shares exceeding the transaction amount', () => {
    expect(() => applySplit({
      amountKobo: 1000, type: 'flat', bearerType: 'account',
      subaccounts: [{ ref: 'A', share: 2000 }],
    })).toThrow(/exceeds the transaction amount/);
  });

  it('bearer=account: main bears the whole charge', () => {
    const r = applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'account', feeKobo: 500,
      subaccounts: [{ ref: 'A', share: 4000 }],
    });
    expect(r.allocations.find((a) => a.ref === 'A')).toMatchObject({ netKobo: 4000, feeKobo: 0 });
    expect(r.allocations.find((a) => a.ref === 'MAIN')).toMatchObject({ netKobo: 6000, feeKobo: 500 }); // charge credited back to MAIN
    expect(sumNet(r)).toBe(10_000);
  });

  it('bearer=subaccount: the bearer subaccount bears the whole charge', () => {
    const r = applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'subaccount',
      bearerSubaccountRef: 'A', feeKobo: 500,
      subaccounts: [{ ref: 'A', share: 4000 }, { ref: 'B', share: 2000 }],
    });
    expect(r.allocations.find((a) => a.ref === 'A')).toMatchObject({ netKobo: 3500, feeKobo: 500 });
    expect(r.allocations.find((a) => a.ref === 'B')).toMatchObject({ netKobo: 2000, feeKobo: 0 });
    expect(sumNet(r)).toBe(10_000);
  });

  it('bearer=subaccount without a matching bearer ref fails loud', () => {
    expect(() => applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'subaccount',
      bearerSubaccountRef: 'ZZZ', feeKobo: 500,
      subaccounts: [{ ref: 'A', share: 4000 }],
    })).toThrow(/bearerSubaccountRef/);
  });

  it('bearer=all: charge split evenly, rounding remainder to main', () => {
    const r = applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'all', feeKobo: 500,
      subaccounts: [{ ref: 'A', share: 4000 }, { ref: 'B', share: 2000 }],
    });
    // floor(500/3)=166 each; main takes the 2k remainder → main fee 168
    expect(r.allocations.find((a) => a.ref === 'A')).toMatchObject({ feeKobo: 166, netKobo: 3834 });
    expect(r.allocations.find((a) => a.ref === 'MAIN')).toMatchObject({ feeKobo: 168, netKobo: 4332 });
    expect(sumNet(r)).toBe(10_000);
  });

  it('bearer=all_proportional: charge pro-rata to gross, remainder to main', () => {
    const r = applySplit({
      amountKobo: 10_001, type: 'percentage', bearerType: 'all_proportional', feeKobo: 301,
      subaccounts: [{ ref: 'A', share: 5000 }, { ref: 'B', share: 5000 }],
    });
    const a = r.allocations.find((x) => x.ref === 'A')!;
    const main = r.allocations.find((x) => x.ref === 'MAIN')!;
    expect(a.grossKobo).toBe(5000); // floor(10001*0.5)
    expect(main.grossKobo).toBe(1); // percentage remainder → main
    expect(r.allocations.reduce((x, y) => x + y.feeKobo, 0)).toBe(301);
    expect(main.netKobo).toBe(301); // gross 1 - fee share 1 + charge credited 301
    expect(sumNet(r)).toBe(10_001);
  });

  it('transaction_charge override replaces the fee entirely', () => {
    const r = applySplit({
      amountKobo: 10_000, type: 'flat', bearerType: 'account',
      feeKobo: 999, transactionChargeKobo: 100,
      subaccounts: [{ ref: 'A', share: 4000 }],
    });
    expect(r.chargeKobo).toBe(100);
    expect(r.allocations.find((a) => a.ref === 'MAIN')).toMatchObject({ feeKobo: 100, netKobo: 6000 }); // 6000 gross − 100 borne + 100 collected
  });

  it('bearer=account charge is a wash for main (borne then collected)', () => {
    const r = applySplit({
      amountKobo: 1000, type: 'flat', bearerType: 'account',
      transactionChargeKobo: 500,
      subaccounts: [{ ref: 'A', share: 900 }],
    });
    expect(r.allocations.find((a) => a.ref === 'MAIN')).toMatchObject({ feeKobo: 500, netKobo: 100 });
    expect(sumNet(r)).toBe(1000);
  });
});

describe('validatePercentageSum', () => {
  it('accepts exactly 10000bps and rejects anything else', () => {
    expect(() => validatePercentageSum([{ ref: 'A', share: 6000 }, { ref: 'B', share: 4000 }])).not.toThrow();
    expect(() => validatePercentageSum([{ ref: 'A', share: 6000 }])).toThrow(/10000bps/);
  });
});

// ─── Router ───────────────────────────────────────────────────────────────────
describe('splitEngine router', () => {
  it('createGroup rejects percentage members that do not sum to 100%', async () => {
    await expect(makeCaller().createGroup({
      name: 'Bad', type: 'percentage',
      members: [{ ref: 'A', share: 5000 }],
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.groups.size).toBe(0);
  });

  it('createGroup persists group + members with SPL_ code', async () => {
    const g: any = await makeCaller().createGroup({
      name: 'Marketplace', type: 'percentage', bearerType: 'all_proportional',
      members: [{ ref: 'ACCT_a', share: 7000 }, { ref: 'ACCT_b', share: 3000 }],
    });
    expect(g.split_code).toMatch(/^SPL_/);
    expect(g.members).toHaveLength(2);
    const fetched: any = await makeCaller().getGroup({ idOrCode: g.split_code });
    expect(fetched.name).toBe('Marketplace');
  });

  it('addMember upserts share and revalidates percentage totals', async () => {
    const g: any = await makeCaller().createGroup({
      name: 'M', type: 'percentage',
      members: [{ ref: 'A', share: 10000 }],
    });
    // update existing member share (A: 10000 → 6000) — still a valid group on its own
    await makeCaller().addMember({ idOrCode: g.id, member: { ref: 'A', share: 6000 } });
    // invalid: adding B would total 10000+ only if A weren't resized first;
    // with A=6000 a 5000bps B overshoots → rejected
    await expect(makeCaller().addMember({
      idOrCode: g.id, member: { ref: 'B', share: 5000 },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const after: any = await makeCaller().addMember({ idOrCode: g.id, member: { ref: 'B', share: 4000 } });
    expect(after.members).toHaveLength(2);
    // removeMember
    const removed: any = await makeCaller().removeMember({ idOrCode: g.id, ref: 'B' });
    expect(removed.members.map((m: any) => m.subaccount_ref)).toEqual(['A']);
  });

  it('deleteGroup deactivates (soft delete)', async () => {
    const g: any = await makeCaller().createGroup({
      name: 'M', type: 'flat', members: [{ ref: 'A', share: 100 }],
    });
    const res = await makeCaller().deleteGroup({ idOrCode: g.id });
    expect(res.active).toBe(false);
    expect(h.groups.get(g.id).active).toBe(false);
  });

  it('previewSplit works from a stored group and honours per-tx overrides', async () => {
    const g: any = await makeCaller().createGroup({
      name: 'M', type: 'percentage', bearerType: 'subaccount', bearerSubaccountRef: 'A',
      members: [{ ref: 'A', share: 4000 }, { ref: 'B', share: 6000 }],
    });
    const r: any = await makeCaller().previewSplit({
      splitCode: g.split_code, amountKobo: 20_000, transactionChargeKobo: 200,
    });
    expect(r.chargeKobo).toBe(200);
    // bearer subaccount A absorbs the 200k override charge
    expect(r.allocations.find((a: any) => a.ref === 'A').netKobo).toBe(7_800);
    expect(r.allocations.find((a: any) => a.ref === 'B').netKobo).toBe(12_000);
    expect(r.allocations.find((a: any) => a.ref === 'MAIN').netKobo).toBe(200); // fee recovered to main
    expect(r.allocations.reduce((a: number, x: any) => a + x.netKobo, 0)).toBe(20_000);
  });

  it('previewSplit supports a fully dynamic split object', async () => {
    const r: any = await makeCaller().previewSplit({
      amountKobo: 50_000,
      dynamic: {
        type: 'flat', bearer_type: 'subaccount', bearer_subaccount_ref: 'ACCT_x',
        subaccounts: [{ ref: 'ACCT_x', share: 5000 }, { ref: 'ACCT_y', share: 3000 }],
      },
      feeKobo: 1000,
    });
    expect(r.allocations.find((a: any) => a.ref === 'ACCT_x').netKobo).toBe(4000);
    expect(r.allocations.find((a: any) => a.ref === 'MAIN').netKobo).toBe(43_000);
    expect(r.allocations.reduce((a: number, x: any) => a + x.netKobo, 0)).toBe(50_000);
  });

  it('previewSplit rejects dynamic percentage splits not summing to 100%', async () => {
    await expect(makeCaller().previewSplit({
      amountKobo: 50_000,
      dynamic: { type: 'percentage', bearer_type: 'account', subaccounts: [{ ref: 'A', share: 9999 }] },
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('recordSplitSettlement writes split_payments and emits split.applied', async () => {
    const g: any = await makeCaller().createGroup({
      name: 'Settle', type: 'percentage', bearerType: 'subaccount', bearerSubaccountRef: 'A',
      members: [{ ref: 'A', share: 2500 }, { ref: 'B', share: 7500 }],
    });
    const { splitPaymentId, result } = await recordSplitSettlement({
      merchantId: 'merch_1', splitCode: g.split_code,
      reference: 'TXN-1', amountKobo: 100_001, feeKobo: 1000,
    });
    expect(splitPaymentId).toMatch(/^sp_/);
    expect(h.settlements).toHaveLength(1);
    const s = h.settlements[0];
    expect(s.merchant_id).toBe('merch_1');
    expect(s.split_code).toBe(g.split_code);
    expect(s.total_amount_kobo).toBe(100_001);
    const legs = JSON.parse(s.legs);
    expect(legs.reduce((a: number, l: any) => a + l.netKobo, 0)).toBe(100_001);
    // bearer subaccount A carries the 1000k fee; MAIN only takes the 1k rounding remainder
    expect(result.allocations.find((a) => a.ref === 'A')!.feeKobo).toBe(1000);
    expect(result.allocations.find((a) => a.ref === 'A')!.netKobo).toBe(24_000);
    expect(result.allocations.find((a) => a.ref === 'MAIN')!.netKobo).toBe(1001); // 1k remainder + 1000k fee recovered
    expect(h.events.map((e) => e.event)).toEqual(['split.applied']);
  });

  it('recordSplitSettlement fails loud for unknown or inactive split codes', async () => {
    await expect(recordSplitSettlement({
      merchantId: 'merch_1', splitCode: 'SPL_NOPE', reference: 'T', amountKobo: 100,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const g: any = await makeCaller().createGroup({
      name: 'Off', type: 'flat', members: [{ ref: 'A', share: 1 }],
    });
    await makeCaller().deleteGroup({ idOrCode: g.id });
    await expect(recordSplitSettlement({
      merchantId: 'merch_1', splitCode: g.split_code, reference: 'T', amountKobo: 100,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(h.settlements).toHaveLength(0);
  });
});
