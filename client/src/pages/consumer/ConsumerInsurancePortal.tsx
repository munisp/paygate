/**
 * ConsumerInsurancePortal — Insurance products, policies, claims, and
 * a real-time AI chat support widget for user questions.
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Shield,
  FileText,
  AlertCircle,
  CheckCircle,
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Loader2,
} from "lucide-react";

// ─── Chat Widget ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

const SUGGESTED_QUESTIONS = [
  "What does health insurance cover?",
  "How do I file a claim?",
  "What is the claims processing time?",
  "Can I cancel my policy early?",
  "Is pre-existing condition covered?",
];

function InsuranceChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hello! I'm your insurance support assistant. How can I help you today? You can ask me about coverage, claims, premiums, or any other insurance questions.",
      ts: Date.now(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Use the Ollama/LLM chat procedure if available, else fall back to a canned response
  const chatMutation = trpc.ollama.chat.useMutation({
    onSuccess: (data: any) => {
      const reply = data?.message ?? data?.response ?? "I'm sorry, I couldn't process that. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, ts: Date.now() },
      ]);
      setIsTyping(false);
    },
    onError: () => {
      // Fallback: simple rule-based responses
      const fallback = getFallbackResponse(input);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: fallback, ts: Date.now() },
      ]);
      setIsTyping(false);
    },
  });

  const getFallbackResponse = (q: string): string => {
    const lower = q.toLowerCase();
    if (lower.includes("claim") && lower.includes("file")) {
      return "To file a claim: 1) Go to 'My Policies', 2) Click 'File Claim' on the relevant policy, 3) Describe the incident and enter the claim amount, 4) Submit. Claims are typically processed within 5–10 business days.";
    }
    if (lower.includes("cancel")) {
      return "You can cancel a policy at any time. Refunds are pro-rated based on the remaining coverage period. Contact support at support@paygate.ng for cancellations.";
    }
    if (lower.includes("pre-existing") || lower.includes("existing condition")) {
      return "Pre-existing conditions may be covered after a waiting period of 12–24 months depending on the policy. Please review the specific policy terms or contact our underwriting team.";
    }
    if (lower.includes("processing time") || lower.includes("how long")) {
      return "Standard claims are processed within 5–10 business days. Emergency health claims are fast-tracked within 48 hours. You'll receive SMS and email updates at each stage.";
    }
    if (lower.includes("cover") || lower.includes("coverage")) {
      return "Coverage varies by product: Health covers hospitalization, surgery, and outpatient care. Life covers death and permanent disability. Device covers accidental damage and theft. Travel covers medical emergencies and trip cancellations.";
    }
    return "Thank you for your question. For detailed assistance, please contact our support team at support@paygate.ng or call 0800-PAYGATE (0800-729-4283). Our agents are available 8am–8pm Monday–Saturday.";
  };

  const sendMessage = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { role: "user", text: msg, ts: Date.now() }]);
    setInput("");
    setIsTyping(true);

    chatMutation.mutate({
      message: `You are a helpful insurance support assistant for PayGate, an African fintech platform. Answer the following user question about insurance products, claims, and policies concisely and helpfully: "${msg}"`,
      model: "llama3.2",
    });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center hover:bg-green-700 transition-colors"
        aria-label="Open insurance chat support"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[520px]">
          {/* Header */}
          <div className="bg-green-600 text-white px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Insurance Support</div>
              <div className="text-xs text-green-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                Online · Typically replies instantly
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="hover:text-green-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    m.role === "assistant" ? "bg-green-100 text-green-700" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "assistant"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm"
                  }`}
                >
                  {m.text}
                  <div className="text-[10px] opacity-60 mt-1">
                    {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested questions */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs bg-muted hover:bg-muted/80 rounded-full px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              placeholder="Ask about insurance..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              className="text-sm"
              disabled={isTyping}
            />
            <Button
              size="icon"
              className="shrink-0 bg-green-600 hover:bg-green-700"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isTyping}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumerInsurancePortal() {
  const [typeFilter, setTypeFilter] = useState<"all" | "health" | "life" | "device" | "travel">(
    "all",
  );
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [claimPolicyId, setClaimPolicyId] = useState<string | null>(null);
  const [claimDescription, setClaimDescription] = useState("");
  const [claimAmount, setClaimAmount] = useState("");

  const { data: products, isLoading } = trpc.newFeatures.consumerInsurance.listProducts.useQuery({
    type: typeFilter,
  });
  const { data: policies, refetch: refetchPolicies } =
    trpc.newFeatures.consumerInsurance.getActivePolicies.useQuery();
  const { data: claims, refetch: refetchClaims } =
    trpc.newFeatures.consumerInsurance.getClaims.useQuery();

  const purchaseMutation = trpc.newFeatures.consumerInsurance.purchasePolicy.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Policy ${d.policyNumber} purchased`);
      setSelectedProduct(null);
      refetchPolicies();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const claimMutation = trpc.newFeatures.consumerInsurance.fileClaim.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Claim ${d.claimNumber} filed`);
      setClaimPolicyId(null);
      setClaimDescription("");
      setClaimAmount("");
      refetchClaims();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) =>
    `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const typeColors: Record<string, string> = {
    health: "bg-green-100 text-green-700",
    life: "bg-blue-100 text-blue-700",
    device: "bg-purple-100 text-purple-700",
    travel: "bg-cyan-100 text-cyan-700",
    shop: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Insurance Portal</h1>
          <p className="text-muted-foreground">
            Protect yourself with affordable insurance products
          </p>
        </div>
        <Badge variant="outline" className="ml-auto text-green-700 border-green-300">
          <MessageCircle className="h-3 w-3 mr-1" />
          Live Chat Support Available
        </Badge>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "health", "life", "device", "travel"].map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(t as any)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle>Available Products</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-4">Loading products...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(products?.products ?? []).map((p: any) => (
                <div
                  key={p.productId}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProduct === p.productId
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() =>
                    setSelectedProduct(p.productId === selectedProduct ? null : p.productId)
                  }
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <Badge className={`text-xs mt-1 ${typeColors[p.type] ?? ""}`}>
                        {p.type}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatKobo(p.premiumKobo ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">
                        per {p.duration ?? "month"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Coverage: <strong>{formatKobo(p.coverageKobo ?? 0)}</strong>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.insurer}</div>

                  {selectedProduct === p.productId && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          purchaseMutation.mutate({ productId: p.productId });
                        }}
                        disabled={purchaseMutation.isPending}
                      >
                        {purchaseMutation.isPending ? "Purchasing..." : "Purchase Policy"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!products?.products?.length && (
                <p className="text-muted-foreground col-span-2 text-center py-4">
                  No products available
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Policies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" /> My Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!policies?.policies?.length ? (
            <p className="text-muted-foreground text-center py-4">No active policies</p>
          ) : (
            <div className="space-y-3">
              {policies.policies.map((pol: any) => (
                <div key={pol.policyId} className="p-3 rounded-lg border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{pol.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        Policy #: {pol.policyNumber}
                      </div>
                    </div>
                    <Badge
                      variant={pol.status === "active" ? "default" : "secondary"}
                    >
                      {pol.status}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>Premium: {formatKobo(pol.premiumKobo ?? 0)}</div>
                    <div>Coverage: {formatKobo(pol.coverageKobo ?? 0)}</div>
                    <div>
                      Expires:{" "}
                      {pol.endDate ? new Date(pol.endDate).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      setClaimPolicyId(pol.policyId === claimPolicyId ? null : pol.policyId)
                    }
                  >
                    <AlertCircle className="h-3 w-3 mr-1" /> File Claim
                  </Button>

                  {claimPolicyId === pol.policyId && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <div>
                        <Label>Claim Description</Label>
                        <Textarea
                          placeholder="Describe the incident..."
                          value={claimDescription}
                          onChange={(e) => setClaimDescription(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label>Claim Amount (₦)</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 50000"
                          value={claimAmount}
                          onChange={(e) => setClaimAmount(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          claimMutation.mutate({
                            policyId: pol.policyId,
                            description: claimDescription,
                            claimAmountKobo: parseFloat(claimAmount) * 100,
                          })
                        }
                        disabled={
                          !claimDescription || !claimAmount || claimMutation.isPending
                        }
                      >
                        {claimMutation.isPending ? "Filing..." : "Submit Claim"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claims History */}
      {(claims?.claims ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Claims History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {claims.claims.map((c: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-2 border-b last:border-0"
                >
                  <div>
                    <div className="font-medium">Claim #{c.claimNumber}</div>
                    <div className="text-sm text-muted-foreground">{c.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatKobo(c.claimAmountKobo ?? 0)}</div>
                    <Badge
                      variant={
                        c.status === "approved"
                          ? "default"
                          : c.status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floating Chat Support Widget */}
      <InsuranceChatWidget />
    </div>
  );
}
