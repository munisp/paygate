/**
 * ollamaRouter.ts — tRPC procedures for local Ollama LLM
 *
 * Exposes: health, listModels, chat (non-streaming), embed, pullModel
 * Streaming chat is handled via a dedicated SSE endpoint in index.ts.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  checkOllamaHealth,
  listOllamaModels,
  ollamaChat,
  ollamaEmbed,
  pullOllamaModel,
  askPayGateAI,
  OLLAMA_DEFAULT_MODEL,
  type OllamaMessage,
} from "./ollama";

export const ollamaRouter = router({
  // ── Health ────────────────────────────────────────────────────────────────
  health: publicProcedure.query(async () => {
    return await checkOllamaHealth();
  }),

  // ── List available models ─────────────────────────────────────────────────
  listModels: protectedProcedure.query(async () => {
    try {
      const models = await listOllamaModels();
      return { models };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Failed to list models",
      });
    }
  }),

  // ── Non-streaming chat ────────────────────────────────────────────────────
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          })
        ),
        model: z.string().optional(),
        system: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(8192).optional(),
        format: z.enum(["json", ""]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const response = await ollamaChat({
          model: input.model ?? OLLAMA_DEFAULT_MODEL,
          messages: input.messages as OllamaMessage[],
          system: input.system,
          options: {
            temperature: input.temperature ?? 0.7,
            num_predict: input.maxTokens ?? 2048,
          },
          format: input.format,
        });
        return {
          content: response.message.content,
          model: response.model,
          evalCount: response.eval_count,
          evalDurationMs: response.eval_duration
            ? Math.round(response.eval_duration / 1_000_000)
            : undefined,
          totalDurationMs: response.total_duration
            ? Math.round(response.total_duration / 1_000_000)
            : undefined,
        };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Ollama chat failed",
        });
      }
    }),

  // ── PayGate Financial AI assistant ───────────────────────────────────────
  askFinancialAI: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(2000),
        context: z.string().max(8000).optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const answer = await askPayGateAI(
          input.question,
          input.context,
          input.history as OllamaMessage[]
        );
        return { answer };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "PayGate AI request failed",
        });
      }
    }),

  // ── Embeddings ────────────────────────────────────────────────────────────
  embed: protectedProcedure
    .input(
      z.object({
        text: z.union([z.string(), z.array(z.string())]),
        model: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await ollamaEmbed({
          model: input.model ?? OLLAMA_DEFAULT_MODEL,
          input: input.text,
        });
        return {
          embeddings: result.embeddings,
          model: result.model,
          dimensions: result.embeddings[0]?.length ?? 0,
        };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Ollama embed failed",
        });
      }
    }),

  // ── Pull model (admin only) ───────────────────────────────────────────────
  pullModel: protectedProcedure
    .input(z.object({ modelName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Only admin users can pull new models
      if ((ctx.user as { role?: string }).role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can pull new Ollama models",
        });
      }
      try {
        await pullOllamaModel(input.modelName);
        return { pulled: true, model: input.modelName };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Model pull failed",
        });
      }
    }),

  // ── Summarize transaction batch ───────────────────────────────────────────
  summarizeTransactions: protectedProcedure
    .input(
      z.object({
        transactions: z.array(
          z.object({
            id: z.string(),
            amount: z.number(),
            currency: z.string(),
            type: z.string(),
            status: z.string(),
            createdAt: z.string(),
            description: z.string().optional(),
          })
        ),
        period: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const txSummary = input.transactions
        .slice(0, 50)
        .map(
          (t) =>
            `${t.createdAt}: ${t.type} ${t.currency} ${(t.amount / 100).toFixed(2)} — ${t.status}${t.description ? ` (${t.description})` : ""}`
        )
        .join("\n");

      const context = `Transaction data for period ${input.period ?? "recent"}:\n${txSummary}`;
      const question =
        "Summarize these transactions: identify patterns, notable items, total volume, success rate, and any anomalies.";

      try {
        const summary = await askPayGateAI(question, context);
        return { summary };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Summarization failed",
        });
      }
    }),

  // ── Fraud explanation ─────────────────────────────────────────────────────
  explainFraudAlert: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        riskScore: z.number(),
        riskFactors: z.array(z.string()),
        amount: z.number(),
        currency: z.string(),
        merchantCategory: z.string().optional(),
        customerLocation: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const context = `
Transaction ID: ${input.transactionId}
Risk Score: ${input.riskScore}/100
Risk Factors: ${input.riskFactors.join(", ")}
Amount: ${input.currency} ${(input.amount / 100).toFixed(2)}
Merchant Category: ${input.merchantCategory ?? "Unknown"}
Customer Location: ${input.customerLocation ?? "Unknown"}
      `.trim();

      const question =
        "Explain this fraud alert in plain language. What does the risk score mean? Why were these risk factors flagged? What action should the merchant take?";

      try {
        const explanation = await askPayGateAI(question, context);
        return { explanation };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Fraud explanation failed",
        });
      }
    }),
});
