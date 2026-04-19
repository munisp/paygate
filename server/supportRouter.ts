import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { supportMessages } from "../drizzle/schema";
import { eq, desc, asc } from "drizzle-orm";
import crypto from "crypto";

// System prompt for the support AI
const SUPPORT_SYSTEM_PROMPT = `You are a helpful, professional support agent for PayGate, a fintech payment processing platform.

You help merchants with:
- Transaction issues (failed payments, refunds, chargebacks)
- Payout problems (delays, missing payouts, bank account issues)
- API integration (webhooks, API keys, SDK usage, error codes)
- Account management (KYC/KYB verification, settings, team management)
- Disputes and chargebacks
- Virtual cards
- BNPL (Buy Now Pay Later) features
- FX and cross-border payments
- Fraud risk management

Guidelines:
- Be concise, professional, and empathetic
- Provide actionable steps when possible
- For complex issues, suggest escalating to the support team
- Never share sensitive information
- If you don't know something, say so honestly
- Keep responses under 200 words unless more detail is needed
- Use plain text, avoid markdown formatting in responses`;

export const supportRouter = router({
  // Send a message and get an AI reply
  sendMessage: publicProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(100),
      content: z.string().min(1).max(2000),
      merchantId: z.string().optional(),
      userId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { agentReply: "I'm sorry, I'm temporarily unavailable. Please try again in a moment." };
      }

      // Save user message
      const userMsgId = crypto.randomUUID();
      await db.insert(supportMessages).values({
        id: userMsgId,
        sessionId: input.sessionId,
        merchantId: input.merchantId ?? null,
        userId: input.userId ?? null,
        role: "user",
        content: input.content,
        status: "delivered",
      });

      // Get recent conversation history for context
      const history = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.sessionId, input.sessionId))
        .orderBy(asc(supportMessages.createdAt))
        .limit(20);

      // Build messages for LLM
      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: SUPPORT_SYSTEM_PROMPT },
      ];

      for (const msg of history) {
        if (msg.role === "user") {
          llmMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "agent") {
          llmMessages.push({ role: "assistant", content: msg.content });
        }
      }

      // Get AI response
      let agentReply = "Thank you for reaching out. I'm looking into your issue. Could you provide more details so I can better assist you?";

      try {
        const response = await invokeLLM({ messages: llmMessages });
        agentReply = response?.choices?.[0]?.message?.content ?? agentReply;
      } catch (err) {
        // Fallback to canned response if LLM fails
        agentReply = getCanonicalResponse(input.content);
      }

      // Save agent reply
      const agentMsgId = crypto.randomUUID();
      await db.insert(supportMessages).values({
        id: agentMsgId,
        sessionId: input.sessionId,
        merchantId: input.merchantId ?? null,
        userId: input.userId ?? null,
        role: "agent",
        content: agentReply,
        status: "delivered",
      });

      return { agentReply, messageId: agentMsgId };
    }),

  // Get conversation history for a session
  getHistory: publicProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(100),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const messages = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.sessionId, input.sessionId))
        .orderBy(asc(supportMessages.createdAt))
        .limit(input.limit);

      return messages;
    }),

  // Admin: list all support sessions (protected)
  listSessions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { sessions: [], total: 0 };

      // Get unique sessions with last message
      const messages = await db
        .select()
        .from(supportMessages)
        .orderBy(desc(supportMessages.createdAt))
        .limit(input.limit * 5); // over-fetch to deduplicate

      // Group by sessionId
      const sessionMap = new Map<string, typeof messages[0]>();
      for (const msg of messages) {
        if (!sessionMap.has(msg.sessionId)) {
          sessionMap.set(msg.sessionId, msg);
        }
      }

      const sessions = Array.from(sessionMap.values())
        .slice(input.offset, input.offset + input.limit);

      return { sessions, total: sessionMap.size };
    }),
});

// Fallback canned responses when LLM is unavailable
function getCanonicalResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes("transaction") && (lower.includes("fail") || lower.includes("error"))) {
    return "I understand you're having trouble with a failed transaction. Please check: (1) The card/bank details are correct, (2) Sufficient funds are available, (3) The transaction isn't blocked by fraud filters. If the issue persists, please share the transaction ID and I'll investigate further.";
  }
  if (lower.includes("payout") && (lower.includes("not") || lower.includes("missing") || lower.includes("delay"))) {
    return "Payout delays can occur due to bank processing times (typically 1-3 business days) or pending KYC verification. Please check your Payouts dashboard for the current status. If it's been more than 3 business days, please share your payout ID and I'll escalate this.";
  }
  if (lower.includes("api") || lower.includes("webhook") || lower.includes("integration")) {
    return "For API integration support, please refer to our documentation at /docs/merchant-guide. Common issues include: incorrect API key permissions, webhook URL not publicly accessible, or missing event types in your webhook configuration. What specific error are you seeing?";
  }
  if (lower.includes("kyc") || lower.includes("kyb") || lower.includes("verification")) {
    return "KYC/KYB verification typically takes 1-2 business days. Please ensure you've uploaded clear, valid documents. You can check your verification status in Settings > Compliance. If your documents were rejected, you'll receive an email with the reason.";
  }
  if (lower.includes("dispute") || lower.includes("chargeback")) {
    return "To dispute a transaction, go to Disputes in your dashboard and click 'File Dispute'. You'll need to provide evidence within 7 days. Our team reviews disputes within 2-3 business days. Would you like help with a specific dispute?";
  }
  return "Thank you for reaching out to PayGate Support. I'm here to help! Could you please provide more details about your issue? The more information you share, the faster I can assist you.";
}
