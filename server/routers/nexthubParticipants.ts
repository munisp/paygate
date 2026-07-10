// Wave 220: nexthubParticipants tRPC router
// Participant lifecycle management, position limits, net debit cap, and liquidity windows
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

const PositionLimitsSchema = z.object({
  participantId: z.string().min(1),
  currency: z.string().length(3).default("NGN"),
  netDebitCap: z.number().int().positive(),
  liquidityCover: z.number().int().nonnegative().default(0),
  positionLimit: z.number().int().positive().optional(),
  alertThreshold: z.number().min(0).max(1).default(0.8),
  suspendOnBreach: z.boolean().default(true),
});

export const nexthubParticipantsRouter = router({
  // ── Participant Lifecycle ──────────────────────────────────────────────────

  listParticipants: protectedProcedure
    .input(z.object({
      status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "OFFBOARDED"]).optional(),
      currency: z.string().length(3).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().nonnegative().default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (input.status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(input.status);
      }
      if (input.currency) {
        conditions.push(`currency = $${paramIdx++}`);
        params.push(input.currency);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await db.execute(
        sql.raw(`
          SELECT id, name, dfsp_id, currency, status, scheme_type,
                 endpoint_url, created_at, updated_at
          FROM nexthub_participants
          ${where}
          ORDER BY created_at DESC
          LIMIT ${input.limit} OFFSET ${input.offset}
        `)
      );

      const countRows = await db.execute(
        sql.raw(`SELECT COUNT(*) as total FROM nexthub_participants ${where}`)
      );

      return {
        participants: rows.rows,
        total: Number((countRows.rows[0] as any)?.total ?? 0),
      };
    }),

  getParticipant: protectedProcedure
    .input(z.object({ participantId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.execute(
        sql.raw(`
          SELECT id, name, dfsp_id, currency, status, scheme_type,
                 endpoint_url, created_at, updated_at
          FROM nexthub_participants
          WHERE id = '${input.participantId}'
          LIMIT 1
        `)
      );
      if (rows.rows.length === 0) throw new Error("Participant not found");
      return rows.rows[0];
    }),

  onboardParticipant: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      dfspId: z.string().min(3).max(32),
      currency: z.string().length(3).default("NGN"),
      schemeType: z.enum(["FSPIOP", "ISO20022", "BOTH"]).default("FSPIOP"),
      endpointUrl: z.string().url(),
      callbackUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = `DFSP-${input.dfspId.toUpperCase()}-${Date.now()}`;
      await db.execute(sql.raw(`
        INSERT INTO nexthub_participants
          (id, name, dfsp_id, currency, status, scheme_type, endpoint_url, created_at, updated_at)
        VALUES
          ('${id}', '${input.name}', '${input.dfspId}', '${input.currency}',
           'PENDING', '${input.schemeType}', '${input.endpointUrl}',
           NOW(), NOW())
      `));
      return { participantId: id, status: "PENDING", message: "Participant onboarding initiated" };
    }),

  suspendParticipant: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      reason: z.string().min(5),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql.raw(`
        UPDATE nexthub_participants
        SET status = 'SUSPENDED', updated_at = NOW()
        WHERE id = '${input.participantId}'
      `));
      return { participantId: input.participantId, status: "SUSPENDED", reason: input.reason };
    }),

  reactivateParticipant: protectedProcedure
    .input(z.object({ participantId: z.string() }))
    .mutation(async ({ input }) => {
      await db.execute(sql.raw(`
        UPDATE nexthub_participants
        SET status = 'ACTIVE', updated_at = NOW()
        WHERE id = '${input.participantId}'
      `));
      return { participantId: input.participantId, status: "ACTIVE" };
    }),

  offboardParticipant: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      reason: z.string().min(5),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql.raw(`
        UPDATE nexthub_participants
        SET status = 'OFFBOARDED', updated_at = NOW()
        WHERE id = '${input.participantId}'
      `));
      return { participantId: input.participantId, status: "OFFBOARDED" };
    }),

  // ── Position Limits ────────────────────────────────────────────────────────

  getLimits: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      currency: z.string().length(3).default("NGN"),
    }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql.raw(`
        SELECT participant_id, currency, net_debit_cap, liquidity_cover,
               position_limit, alert_threshold, suspend_on_breach, updated_at, updated_by
        FROM nexthub_participant_limits
        WHERE participant_id = '${input.participantId}'
          AND currency = '${input.currency}'
        LIMIT 1
      `));
      if (rows.rows.length === 0) {
        return {
          participantId: input.participantId,
          currency: input.currency,
          netDebitCap: null,
          liquidityCover: 0,
          alertThreshold: 0.8,
          suspendOnBreach: true,
          configured: false,
        };
      }
      return { ...rows.rows[0], configured: true };
    }),

  setLimits: protectedProcedure
    .input(PositionLimitsSchema)
    .mutation(async ({ input, ctx }) => {
      await db.execute(sql.raw(`
        INSERT INTO nexthub_participant_limits
          (participant_id, currency, net_debit_cap, liquidity_cover,
           position_limit, alert_threshold, suspend_on_breach, updated_at, updated_by)
        VALUES
          ('${input.participantId}', '${input.currency}', ${input.netDebitCap},
           ${input.liquidityCover}, ${input.positionLimit ?? input.netDebitCap * 2},
           ${input.alertThreshold}, ${input.suspendOnBreach},
           NOW(), '${ctx.user.id}')
        ON CONFLICT (participant_id, currency)
        DO UPDATE SET
          net_debit_cap = EXCLUDED.net_debit_cap,
          liquidity_cover = EXCLUDED.liquidity_cover,
          position_limit = EXCLUDED.position_limit,
          alert_threshold = EXCLUDED.alert_threshold,
          suspend_on_breach = EXCLUDED.suspend_on_breach,
          updated_at = NOW(),
          updated_by = EXCLUDED.updated_by
      `));
      return { success: true, participantId: input.participantId, currency: input.currency };
    }),

  // ── Current Positions ─────────────────────────────────────────────────────

  getPositions: protectedProcedure
    .input(z.object({
      currency: z.string().length(3).default("NGN"),
      status: z.enum(["OK", "ALERT", "BREACHED", "SUSPENDED", "ALL"]).default("ALL"),
    }))
    .query(async ({ input }) => {
      // In production this reads from Redis via the middleware bridge
      // For the portal we query the positions snapshot table updated by the Go service
      const statusFilter = input.status !== "ALL"
        ? `AND position_status = '${input.status}'`
        : "";

      const rows = await db.execute(sql.raw(`
        SELECT p.id as participant_id, p.name, p.dfsp_id,
               COALESCE(pos.current_value, 0) as current_value,
               COALESCE(pos.reserved_value, 0) as reserved_value,
               COALESCE(pos.available_value, 0) as available_value,
               COALESCE(pos.ndc_utilisation, 0) as ndc_utilisation,
               COALESCE(pos.position_status, 'OK') as position_status,
               COALESCE(lim.net_debit_cap, 0) as net_debit_cap,
               pos.last_updated
        FROM nexthub_participants p
        LEFT JOIN nexthub_participant_positions pos
          ON pos.participant_id = p.id AND pos.currency = '${input.currency}'
        LEFT JOIN nexthub_participant_limits lim
          ON lim.participant_id = p.id AND lim.currency = '${input.currency}'
        WHERE p.status != 'OFFBOARDED'
          AND p.currency = '${input.currency}'
          ${statusFilter}
        ORDER BY pos.ndc_utilisation DESC NULLS LAST
      `));

      const summary = {
        total: rows.rows.length,
        breached: rows.rows.filter((r: any) => r.position_status === "BREACHED").length,
        alert: rows.rows.filter((r: any) => r.position_status === "ALERT").length,
        suspended: rows.rows.filter((r: any) => r.position_status === "SUSPENDED").length,
        ok: rows.rows.filter((r: any) => r.position_status === "OK").length,
      };

      return { positions: rows.rows, summary, currency: input.currency };
    }),

  // ── Liquidity Windows ─────────────────────────────────────────────────────

  getLiquidityWindows: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      status: z.enum(["OPEN", "CLOSED", "SETTLED", "ALL"]).default("OPEN"),
    }))
    .query(async ({ input }) => {
      const statusFilter = input.status !== "ALL"
        ? `AND status = '${input.status}'`
        : "";

      const rows = await db.execute(sql.raw(`
        SELECT window_id, participant_id, currency, amount,
               opened_at, closes_at, status
        FROM nexthub_liquidity_windows
        WHERE participant_id = '${input.participantId}'
          ${statusFilter}
        ORDER BY opened_at DESC
      `));
      return rows.rows;
    }),

  openLiquidityWindow: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      currency: z.string().length(3).default("NGN"),
      amount: z.number().int().positive(),
      durationHours: z.number().int().min(1).max(168).default(24),
    }))
    .mutation(async ({ input }) => {
      const windowId = `LW-${input.participantId}-${Date.now()}`;
      const closesAt = new Date(Date.now() + input.durationHours * 3600 * 1000).toISOString();

      await db.execute(sql.raw(`
        INSERT INTO nexthub_liquidity_windows
          (window_id, participant_id, currency, amount, opened_at, closes_at, status)
        VALUES
          ('${windowId}', '${input.participantId}', '${input.currency}',
           ${input.amount}, NOW(), '${closesAt}', 'OPEN')
      `));

      return { windowId, participantId: input.participantId, amount: input.amount, closesAt };
    }),

  closeLiquidityWindow: protectedProcedure
    .input(z.object({
      participantId: z.string(),
      windowId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql.raw(`
        UPDATE nexthub_liquidity_windows
        SET status = 'CLOSED'
        WHERE window_id = '${input.windowId}'
          AND participant_id = '${input.participantId}'
      `));
      return { windowId: input.windowId, status: "CLOSED" };
    }),

  // ── Stats ─────────────────────────────────────────────────────────────────

  getParticipantStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql.raw(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_count,
          COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended_count,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
          COUNT(*) FILTER (WHERE status = 'OFFBOARDED') as offboarded_count,
          COUNT(*) as total_count
        FROM nexthub_participants
      `));

      const limRows = await db.execute(sql.raw(`
        SELECT
          COUNT(*) FILTER (WHERE net_debit_cap IS NOT NULL) as limits_configured,
          AVG(net_debit_cap) as avg_ndc,
          MAX(net_debit_cap) as max_ndc,
          MIN(net_debit_cap) as min_ndc
        FROM nexthub_participant_limits
      `));

      return {
        participants: rows.rows[0],
        limits: limRows.rows[0],
      };
    }),
});
