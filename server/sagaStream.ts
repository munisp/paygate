/**
 * Saga Stream — Server-Sent Events (SSE) endpoint for real-time saga step updates.
 *
 * Route: GET /api/saga-stream/:sagaId
 *
 * The client connects once and receives a stream of `SagaStepEvent` objects
 * as the saga progresses through its steps. The server polls the
 * `saga_instances` table every 2 seconds and pushes diffs to connected clients.
 *
 * Authentication: requires a valid session cookie (same as tRPC procedures).
 * The session is validated via the JWT in the cookie before the SSE connection
 * is accepted.
 *
 * NOTE (R4): `sagaStreamHandler` is currently NOT mounted on any Express app
 * (no imports/routes reference it — dead code kept for future wiring). The
 * null-check + jti revocation enforcement below is defense-in-depth in case
 * it is ever mounted.
 */

import { Request, Response } from "express";
import { getDb } from "./db";
import { sagaInstances } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "./_core/keycloak";
import { isJtiRevoked } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const";

export interface SagaStepEvent {
  sagaId: string;
  sagaType: "fhir_payment" | "cbdc_atomic_swap";
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepStatus: "pending" | "active" | "completed" | "failed";
  steps: Array<{
    index: number;
    name: string;
    status: "pending" | "active" | "completed" | "failed";
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }>;
  overallStatus: "running" | "completed" | "failed" | "compensating";
  startedAt: string;
  updatedAt: string;
}

// FHIR Payment Orchestration — 5 steps
const FHIR_STEPS = [
  "Patient Eligibility Verification",
  "Prior Authorization",
  "Claim Adjudication",
  "ERA Generation",
  "Settlement Posting",
];

// CBDC Atomic Swap — 6 steps
const CBDC_STEPS = [
  "Lock CBDC Escrow",
  "Verify Counterparty",
  "Publish ILP Condition",
  "Fulfil ILP Preimage",
  "Release Commercial Bank Funds",
  "Confirm Atomic Settlement",
];

function getStepsForType(sagaType: string): string[] {
  if (sagaType === "cbdc_atomic_swap") return CBDC_STEPS;
  return FHIR_STEPS;
}

/**
 * Build a SagaStepEvent from a saga_instances row.
 * The `stepsJson` column stores a JSON array of step objects.
 */
function buildEvent(row: {
  id: string;
  sagaType: string;
  currentStep: number | null;
  status: string;
  steps: unknown;
  startedAt: Date | null;
}): SagaStepEvent {
  const stepNames = getStepsForType(row.sagaType);
  const totalSteps = stepNames.length;
  const currentStep = row.currentStep ?? 0;

  // Parse stored steps or synthesise from currentStep
  let storedSteps: Array<{
    index: number;
    name: string;
    status: "pending" | "active" | "completed" | "failed";
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  if (row.steps && typeof row.steps === "object" && Array.isArray(row.steps)) {
    storedSteps = row.steps as typeof storedSteps;
  } else {
    // Synthesise step statuses from currentStep
    storedSteps = stepNames.map((name, i) => ({
      index: i,
      name,
      status:
        i < currentStep
          ? "completed"
          : i === currentStep && row.status === "running"
          ? "active"
          : i === currentStep && row.status === "failed"
          ? "failed"
          : "pending",
    }));
  }

  const activeStep = storedSteps.find((s) => s.status === "active") ?? storedSteps[currentStep];

  return {
    sagaId: row.id,
    sagaType: row.sagaType as SagaStepEvent["sagaType"],
    currentStep,
    totalSteps,
    stepName: activeStep?.name ?? stepNames[currentStep] ?? "Unknown",
    stepStatus: (activeStep?.status ?? "pending") as SagaStepEvent["stepStatus"],
    steps: storedSteps,
    overallStatus: row.status as SagaStepEvent["overallStatus"],
    startedAt: row.startedAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Express handler for GET /api/saga-stream/:sagaId
 */
export async function sagaStreamHandler(req: Request, res: Response) {
  const { sagaId } = req.params;

  // Validate session
  try {
    const cookie = req.cookies?.[COOKIE_NAME];
    if (!cookie) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // verifySessionToken returns null (not throw) for invalid/expired tokens —
    // a null result MUST reject, otherwise the SSE stream would serve
    // unauthenticated requests.
    const session = await verifySessionToken(cookie);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // R4 spec #8: reject tokens whose jti has been revoked (logout / password
    // change). Failure policy mirrors sdk.verifySession: on DB error, log +
    // allow so a transient outage cannot DoS authenticated requests.
    if (session.jti) {
      try {
        if (await isJtiRevoked(session.jti)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
      } catch (revocationError) {
        console.error(
          "[SagaStream] ALERT: jwt_revocation_list check failed; allowing token to avoid login DoS:",
          revocationError
        );
      }
    }
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  const db = (await getDb())!;
  let lastUpdatedAt: string | null = null;
  let closed = false;

  const sendEvent = (event: SagaStepEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  };

  const sendError = (message: string) => {
    if (closed) return;
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  };

  const sendPing = () => {
    if (closed) return;
    res.write(`: ping\n\n`);
  };

  // Poll loop
  const poll = async () => {
    if (closed) return;

    try {
      const rows = await db
        .select()
        .from(sagaInstances)
        .where(eq(sagaInstances.id, sagaId))
        .limit(1);

      if (rows.length === 0) {
        sendError(`Saga ${sagaId} not found`);
        res.end();
        closed = true;
        return;
      }

      const row = rows[0];
      // sagaInstances has no updatedAt — use completedAt or startedAt as change signal
      const changeKey = `${row.currentStep}-${row.status}-${row.completedAt?.toISOString() ?? ""}`;

      // Only push if there is a change
      if (changeKey !== lastUpdatedAt) {
        lastUpdatedAt = changeKey;
        sendEvent(buildEvent(row));
      } else {
        sendPing();
      }

      // Stop polling once saga reaches a terminal state
      if (row.status === "completed" || row.status === "failed") {
        // Send final event then close
        setTimeout(() => {
          if (!closed) {
            res.write(`event: done\ndata: ${JSON.stringify({ sagaId, status: row.status })}\n\n`);
            res.end();
            closed = true;
          }
        }, 500);
        return;
      }
    } catch (err) {
      sendError("Internal error polling saga state");
    }

    if (!closed) {
      setTimeout(poll, 2000);
    }
  };

  // Start polling
  poll();

  // Clean up on client disconnect
  req.on("close", () => {
    closed = true;
  });
}
