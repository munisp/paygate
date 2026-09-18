/**
 * velocityEnforcer.ts
 *
 * Checks active velocity limit configs for a merchant/channel and calls the
 * Rust velocity-counter service to increment and validate the sliding window.
 *
 * Throws TRPCError FORBIDDEN if any limit is breached.
 * Records breach in the velocityBreaches table for audit.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "./db";
import { velocityLimitConfigs, velocityBreaches } from "../drizzle/schema";

const VELOCITY_COUNTER_URL = process.env.VELOCITY_COUNTER_URL ?? "http://velocity-counter:8090";

interface VelocityCheckParams {
  merchantId: string;
  channel: string;
  amountKobo: number;
  userId: number;
}

export async function enforceVelocityLimits(params: VelocityCheckParams): Promise<void> {
  const { merchantId, channel, amountKobo, userId } = params;
  const db = await getDb();
  if (!db) return; // DB unavailable — fail open

  const limits = await db
    .select()
    .from(velocityLimitConfigs)
    .where(
      and(
        eq(velocityLimitConfigs.isActive, true),
        or(
          eq(velocityLimitConfigs.merchantId, merchantId),
          isNull(velocityLimitConfigs.merchantId)
        ),
        or(
          eq(velocityLimitConfigs.channel, channel),
          eq(velocityLimitConfigs.channel, "all")
        )
      )
    );

  if (limits.length === 0) return;

  for (const limit of limits) {
    const windowSecs = limit.windowSeconds;
    const url = `${VELOCITY_COUNTER_URL}/check/${merchantId}/${channel}/${windowSecs}`;
    let counterResult: { count: number; amount_kobo: number };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kobo: amountKobo }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        console.error(`[VelocityEnforcer] Counter service error ${res.status} for ${merchantId}`);
        continue;
      }
      counterResult = (await res.json()) as { count: number; amount_kobo: number };
    } catch (err) {
      console.error(`[VelocityEnforcer] Counter service unreachable:`, err);
      continue;
    }

    const countBreached = limit.maxCount != null && counterResult.count > limit.maxCount;
    const amountBreached = limit.maxAmountKobo != null && counterResult.amount_kobo > limit.maxAmountKobo;
    const maxValue = countBreached ? limit.maxCount : limit.maxAmountKobo;

    if (countBreached || amountBreached) {
      db.insert(velocityBreaches).values({
        limitConfigId: limit.id,
        merchantId,
        channel,
        amountKobo,
        userId,
        details: JSON.stringify({
          observedCount: counterResult.count,
          observedAmountKobo: counterResult.amount_kobo,
          maxValue,
          limitType: limit.limitType,
          windowSeconds: windowSecs,
        }),
        breachedAt: new Date(),
      }).catch((e: unknown) => console.error("[VelocityEnforcer] Failed to record breach:", e));

      throw new TRPCError({
        code: "FORBIDDEN",
        message: countBreached
          ? `Transaction count limit exceeded: ${counterResult.count} in ${windowSecs}s window (max ${maxValue})`
          : `Transaction amount limit exceeded: ₦${(counterResult.amount_kobo / 100).toFixed(2)} in ${windowSecs}s window`,
      });
    }
  }
}
