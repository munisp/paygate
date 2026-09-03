// @ts-nocheck
/**
 * AP Assistant — AI copilot for Accounts Payable (art-reasoning ReAct loop).
 * Ask questions about your AP state; the assistant returns an answer plus
 * inert draft_payment PROPOSALS. Confirming a proposal re-validates it against
 * the real bill gates and returns a payload for the canonical Bill Pay flow —
 * the assistant never moves money itself (maker-checker stays on payBill).
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Bot, Send, Loader2, User, Sparkles, ShieldCheck, ChevronRight,
  ScrollText, Wallet, CreditCard, Building2, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}

const FUNDING_ICONS: Record<string, any> = {
  wallet: Wallet,
  card: CreditCard,
  bank_transfer: Building2,
  pay_over_time: CalendarClock,
};

const SUGGESTED = [
  "Which bills are due in the next 30 days?",
  "Summarize my outstanding payables",
  "What is my pending WHT exposure?",
  "Draft a payment for my largest approved bill",
];

type Proposal = {
  type: "draft_payment";
  billId: string;
  amountKobo: number;
  fundingMethod: "wallet" | "card" | "bank_transfer" | "pay_over_time";
  rationale: string;
};

type Message = {
  role: "user" | "assistant";
  text: string;
  traceId?: string;
  proposals?: Proposal[];
  // proposalIndex → confirmation result
  confirmations?: Record<number, { requiresApproval: boolean; nextStep: string; validatedPayload: any }>;
  error?: boolean;
};

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [traceFor, setTraceFor] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = trpc.apAssistant.ask.useMutation();
  const confirmAction = trpc.apAssistant.confirmAction.useMutation();
  const { data: traceData, isLoading: traceLoading } = trpc.apAssistant.getTrace.useQuery(
    { traceId: traceFor! },
    { enabled: !!traceFor, retry: false },
  );

  const submit = (question?: string) => {
    const q = (question ?? input).trim();
    if (q.length < 3) {
      toast.error("Ask a question of at least 3 characters");
      return;
    }
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    ask.mutate(
      { question: q },
      {
        onSuccess: (r: any) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: r.answer ?? "", traceId: r.traceId, proposals: r.proposals ?? [] },
          ]);
        },
        onError: (e) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: e.message, error: true },
          ]);
        },
      },
    );
  };

  const confirmProposal = (messageIndex: number, proposalIndex: number, traceId: string) => {
    confirmAction.mutate(
      { traceId, proposalIndex, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (r: any) => {
          toast.success("Proposal validated — complete it in Bill Pay");
          setMessages((prev) =>
            prev.map((m, i) =>
              i === messageIndex
                ? { ...m, confirmations: { ...(m.confirmations ?? {}), [proposalIndex]: r } }
                : m,
            ),
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            AP Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ask about bills, vendors and WHT — the assistant proposes, you approve, Bill Pay executes</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-500/15 text-violet-400">
          <Sparkles className="w-3 h-3" /> art-reasoning
        </span>
      </div>

      {/* Chat area */}
      <div className="flex-1 min-h-0 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Ask me anything about your payables</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">I can query bills, summarize AP state and draft payments for your approval</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="px-3 py-1.5 rounded-full text-xs border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, mi) => (
                <div key={mi} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[75%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
                    <div className={`rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : m.error
                          ? "bg-red-500/10 border border-red-500/30 text-red-300"
                          : "bg-muted/40 text-foreground"
                    }`}>
                      {m.text}
                    </div>

                    {/* Proposals */}
                    {m.proposals && m.proposals.length > 0 && (
                      <div className="space-y-2">
                        {m.proposals.map((p, pi) => {
                          const confirmation = m.confirmations?.[pi];
                          const Icon = FUNDING_ICONS[p.fundingMethod] ?? Wallet;
                          return (
                            <div key={pi} className="rounded-xl border border-border bg-card p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Draft payment</span>
                                <Icon className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="text-sm">
                                <span className="font-semibold text-foreground">{formatNGN(p.amountKobo)}</span>
                                <span className="text-muted-foreground text-xs"> via {p.fundingMethod.replace(/_/g, " ")}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{p.rationale}</p>
                              <p className="text-xs text-muted-foreground font-mono">Bill: {p.billId.slice(0, 8)}…</p>
                              {confirmation ? (
                                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2.5 space-y-1.5">
                                  <p className="text-xs text-green-300 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Validated against bill gates — requires approval via {confirmation.nextStep}
                                  </p>
                                  <Link href="/ap/bills">
                                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                                      Open Bill Pay <ChevronRight className="w-3 h-3" />
                                    </Button>
                                  </Link>
                                </div>
                              ) : (
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    disabled={confirmAction.isPending}
                                    onClick={() => m.traceId && confirmProposal(mi, pi, m.traceId)}
                                  >
                                    {confirmAction.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                    Confirm Proposal
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Trace link */}
                    {m.role === "assistant" && m.traceId && !m.error && (
                      <button
                        onClick={() => setTraceFor(m.traceId!)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ScrollText className="w-3 h-3" /> View reasoning trace
                      </button>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {ask.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="rounded-xl px-4 py-3 bg-muted/40 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Reasoning over your AP state…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about bills, vendors, WHT… (Enter to send)"
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
            />
            <Button onClick={() => submit()} disabled={ask.isPending || input.trim().length < 3} className="gap-2 shrink-0">
              {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* ── Trace dialog ── */}
      <Dialog open={!!traceFor} onOpenChange={(o) => { if (!o) setTraceFor(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reasoning Trace</DialogTitle>
          </DialogHeader>
          {traceLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading trace…
            </div>
          ) : traceData ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Audit Record</h3>
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                  <p><span className="text-muted-foreground">Model:</span> <span className="text-foreground font-mono">{traceData.audit?.modelId}</span></p>
                  <p><span className="text-muted-foreground">Decision:</span> <span className="text-foreground font-mono">{traceData.audit?.decision}</span></p>
                  <p><span className="text-muted-foreground">Confidence:</span> <span className="text-foreground font-mono">{traceData.audit?.confidence}</span></p>
                  {traceData.audit?.latencyMs != null && (
                    <p><span className="text-muted-foreground">Latency:</span> <span className="text-foreground font-mono">{traceData.audit.latencyMs} ms</span></p>
                  )}
                  {traceData.audit?.artSteps != null && (
                    <p><span className="text-muted-foreground">ReAct steps:</span> <span className="text-foreground font-mono">{traceData.audit.artSteps}</span></p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Trace</h3>
                {traceData.serviceTrace ? (
                  <pre className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-foreground overflow-x-auto max-h-72">
                    {JSON.stringify(traceData.serviceTrace, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">Service trace unavailable (the reasoning service may be down) — the audit record above is the authoritative log.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Trace not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
