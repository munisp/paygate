/**
 * PayGate Developer Portal
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *  - pk_test / pk_live key toggle (sandbox mode)
 *  - Live API key injection into Go/Rust/Python/Node/cURL code samples
 *  - "Run in Sandbox" button that fires a real test charge via tRPC
 *  - API reference table
 *  - SDK package cards
 *  - Middleware architecture overview
 */
import { useState, useEffect, useCallback } from "react";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import {
  Copy, Check, Code2, Key, BookOpen, Zap, Globe, Shield,
  Terminal, ChevronRight, Play, CheckCircle, XCircle, Loader2,
  ToggleLeft, ToggleRight, AlertTriangle, Webhook, RefreshCw,
  ChevronDown, ChevronUp, Clock, AlertOctagon, Star,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";


// ─── Types ────────────────────────────────────────────────────────────────────

type EnvMode = "test" | "live";
type LangId = "go" | "rust" | "python" | "node" | "curl";

// ─── Code Sample Templates ────────────────────────────────────────────────────

const SAMPLES = {
  "Charge a Card": {
    go: (key: string) => `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

const apiKey = "${key}"

type ChargeRequest struct {
    Amount      int    \`json:"amount"\`
    Currency    string \`json:"currency"\`
    Email       string \`json:"email"\`
    Reference   string \`json:"reference"\`
}

func chargeCard(req ChargeRequest) error {
    body, _ := json.Marshal(req)
    r, _ := http.NewRequest("POST",
        "https://api.paygate.africa/v1/charge",
        bytes.NewReader(body))
    r.Header.Set("Authorization", "Bearer "+apiKey)
    r.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(r)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    fmt.Printf("Status: %d\\n", resp.StatusCode)
    return nil
}

func main() {
    chargeCard(ChargeRequest{
        Amount:    5000,
        Currency:  "NGN",
        Email:     "customer@example.com",
        Reference: "ORDER_001",
    })
}`,
    rust: (key: string) => `use reqwest::Client;
use serde_json::json;

const API_KEY: &str = "${key}";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();

    let response = client
        .post("https://api.paygate.africa/v1/charge")
        .bearer_auth(API_KEY)
        .json(&json!({
            "amount": 5000,
            "currency": "NGN",
            "email": "customer@example.com",
            "reference": "ORDER_001"
        }))
        .send()
        .await?;

    println!("Status: {}", response.status());
    let body: serde_json::Value = response.json().await?;
    println!("Response: {}", serde_json::to_string_pretty(&body)?);
    Ok(())
}`,
    python: (key: string) => `import requests

API_KEY = "${key}"

def charge_card(amount: int, currency: str, email: str, reference: str) -> dict:
    """Charge a card via PayGate API."""
    response = requests.post(
        "https://api.paygate.africa/v1/charge",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "amount": amount,
            "currency": currency,
            "email": email,
            "reference": reference,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()

if __name__ == "__main__":
    result = charge_card(5000, "NGN", "customer@example.com", "ORDER_001")
    print(result)`,
    node: (key: string) => `const API_KEY = "${key}";

async function chargeCard({ amount, currency, email, reference }) {
  const response = await fetch("https://api.paygate.africa/v1/charge", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, currency, email, reference }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Charge failed");
  }

  return response.json();
}

chargeCard({
  amount: 5000,
  currency: "NGN",
  email: "customer@example.com",
  reference: "ORDER_001",
}).then(console.log).catch(console.error);`,
    curl: (key: string) => `curl -X POST https://api.paygate.africa/v1/charge \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 5000,
    "currency": "NGN",
    "email": "customer@example.com",
    "reference": "ORDER_001"
  }'`,
  },

  "Cross-Border Transfer": {
    go: (key: string) => `package main

    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

const apiKey = "${key}"

func InitiateCrossBorderTransfer(
    receiverMSISDN, corridor string,
    amount float64,
) (string, error) {
    payload := map[string]any{
        "receiver_id":      receiverMSISDN,
        "receiver_id_type": "MSISDN",
        "corridor":         corridor,
        "amount":           fmt.Sprintf("%.2f", amount),
        "rail":             "mojaloop",
    }
    body, _ := json.Marshal(payload)
    req, _ := http.NewRequest("POST",
        "https://api.paygate.africa/v1/cross-border/transfer",
        bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result map[string]any
    json.NewDecoder(resp.Body).Decode(&result)
    return result["transfer_id"].(string), nil
}`,
    rust: (key: string) => `use reqwest::Client;
use serde_json::json;

const API_KEY: &str = "${key}";

pub async fn initiate_cross_border(
    receiver_msisdn: &str,
    corridor: &str,
    amount: f64,
) -> Result<String, Box<dyn std::error::Error>> {
    let (source, target) = corridor.split_once('-')
        .ok_or("Invalid corridor")?;

    let client = Client::new();
    let resp = client
        .post("https://api.paygate.africa/v1/cross-border/transfer")
        .bearer_auth(API_KEY)
        .json(&json!({
            "receiver_id": receiver_msisdn,
            "receiver_id_type": "MSISDN",
            "corridor": corridor,
            "source_currency": source,
            "target_currency": target,
            "amount": format!("{:.2}", amount),
            "rail": "mojaloop"
        }))
        .send()
        .await?;

    let body: serde_json::Value = resp.json().await?;
    Ok(body["transfer_id"].as_str().unwrap_or("").to_string())
}`,
    python: (key: string) => `import requests
from dataclasses import dataclass

API_KEY = "${key}"

@dataclass
class TransferResult:
    transfer_id: str
    status: str
    source_amount: float
    target_amount: float
    exchange_rate: float

def initiate_cross_border_transfer(
    receiver_msisdn: str,
    corridor: str,
    amount: float,
    rail: str = "mojaloop",
) -> TransferResult:
    source, target = corridor.split("-")
    response = requests.post(
        "https://api.paygate.africa/v1/cross-border/transfer",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "receiver_id": receiver_msisdn,
            "receiver_id_type": "MSISDN",
            "corridor": corridor,
            "source_currency": source,
            "target_currency": target,
            "amount": str(amount),
            "rail": rail,
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return TransferResult(**{k: data[k] for k in TransferResult.__dataclass_fields__})`,
    node: (key: string) => `const API_KEY = "${key}";

async function initiateCrossBorderTransfer(
  receiverMsisdn, corridor, amount, rail = "mojaloop"
) {
  const [source, target] = corridor.split("-");
  const response = await fetch(
    "https://api.paygate.africa/v1/cross-border/transfer",
    {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiver_id: receiverMsisdn,
        receiver_id_type: "MSISDN",
        corridor,
        source_currency: source,
        target_currency: target,
        amount: String(amount),
        rail,
      }),
    }
  );
  return response.json();
}`,
    curl: (key: string) => `curl -X POST https://api.paygate.africa/v1/cross-border/transfer \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "receiver_id": "+254712345678",
    "receiver_id_type": "MSISDN",
    "corridor": "NGN-KES",
    "source_currency": "NGN",
    "target_currency": "KES",
    "amount": "10000",
    "rail": "mojaloop"
  }'`,
  },

  "Webhook Verification": {
    go: (key: string) => `package main

    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "net/http"
)

func VerifyWebhookSignature(r *http.Request, secret string) ([]byte, bool) {
    sig := r.Header.Get("X-PayGate-Signature")
    body, err := io.ReadAll(r.Body)
    if err != nil {
        return nil, false
    }
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return body, hmac.Equal([]byte(sig), []byte(expected))
}

// Webhook secret: ${key}`,
    rust: (key: string) => `use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

// Webhook secret: ${key}
pub fn verify_webhook_signature(payload: &[u8], sig_header: &str) -> bool {
    let expected = sig_header.strip_prefix("sha256=").unwrap_or("");
    let mut mac = HmacSha256::new_from_slice(b"${key}")
        .expect("HMAC init failed");
    mac.update(payload);
    let computed = hex::encode(mac.finalize().into_bytes());
    computed.as_bytes().iter()
        .zip(expected.as_bytes().iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}`,
    python: (key: string) => `import hashlib, hmac

WEBHOOK_SECRET = "${key}"

def verify_webhook_signature(payload: bytes, signature_header: str) -> bool:
    expected = signature_header.removeprefix("sha256=")
    computed = hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, expected)`,
    node: (key: string) => `const crypto = require("crypto");

const WEBHOOK_SECRET = "${key}";

function verifyWebhookSignature(payload, signatureHeader) {
  const expected = signatureHeader?.replace("sha256=", "") ?? "";
  const computed = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(expected, "hex")
  );
}`,
    curl: (_key: string) => `# Test a webhook delivery from the dashboard:
curl -X POST https://api.paygate.africa/v1/webhooks/{webhook_id}/test \\
  -H "Authorization: Bearer YOUR_API_KEY"

# PayGate sends events with:
#   Content-Type: application/json
#   X-PayGate-Signature: sha256=<hmac_hex>`,
  },
} as const;

const LANGUAGES: { id: LangId; label: string }[] = [
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
  { id: "curl", label: "cURL" },
];

const API_ENDPOINTS = [
  { method: "POST", path: "/v1/charge", desc: "Charge a payment instrument", auth: true },
  { method: "GET", path: "/v1/transactions/{id}", desc: "Retrieve a transaction", auth: true },
  { method: "POST", path: "/v1/payouts", desc: "Initiate a bank payout", auth: true },
  { method: "POST", path: "/v1/cross-border/transfer", desc: "Cross-border transfer (Mojaloop/BRICS Pay)", auth: true },
  { method: "GET", path: "/v1/cross-border/quote", desc: "Get FX quote for a corridor", auth: true },
  { method: "POST", path: "/v1/virtual-cards", desc: "Issue a virtual card", auth: true },
  { method: "POST", path: "/v1/payment-links", desc: "Create a payment link", auth: true },
  { method: "GET", path: "/v1/rates/{from}/{to}", desc: "Get live FX rate", auth: false },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  POST: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

// ─── Webhook Event Log ───────────────────────────────────────────────────────

type DeliveryRow = {
  id: string;
  eventType: string;
  status: string;
  responseStatus: number | null;
  latencyMs: number | null;
  createdAt: Date;
  payload: unknown;
  responseBody: string | null;
  attemptCount: number;
};

function DeliveryStatusBadge({ status, responseStatus }: { status: string; responseStatus: number | null }) {
  const isSuccess = status === "delivered" || (responseStatus && responseStatus >= 200 && responseStatus < 300);
  const isFailed = status === "failed";
  const isPending = status === "pending" || status === "retrying";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
      isSuccess ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
      isFailed ? "bg-red-500/10 text-red-400 border-red-500/20" :
      "bg-amber-500/10 text-amber-400 border-amber-500/20"
    }`}>
      {isSuccess ? <CheckCircle className="w-2.5 h-2.5" /> : isFailed ? <XCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {responseStatus ? `HTTP ${responseStatus}` : status}
    </span>
  );
}

function WebhookEventLog() {
  const devPortalInterval = useAdaptiveInterval(30000);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [webhookFilter, setWebhookFilter] = useState<string>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: webhooks } = trpc.webhooks.list.useQuery();
  const { data: deliveries, isLoading, refetch } = trpc.webhookDeliveries.list.useQuery(
    {
      webhookId: webhookFilter === "all" ? undefined : webhookFilter,
      limit: 20,
    },
    { refetchInterval: devPortalInterval }
  , { staleTime: 30_000 });

  const retryMutation = trpc.webhookDeliveries.retry.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Retry succeeded — HTTP ${data.responseStatus} in ${data.latencyMs}ms`);
      } else {
        toast.error(`Retry failed — HTTP ${data.responseStatus ?? "no response"}`);
      }
      utils.webhookDeliveries.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setRetryingId(null),
  });

  const handleRetry = useCallback((deliveryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingId(deliveryId);
    retryMutation.mutate({ deliveryId });
  }, [retryMutation]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const rows = (deliveries ?? []) as DeliveryRow[];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Webhook className="w-4 h-4 text-purple-400" />
            Webhook Event Log
            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">Last 20</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Webhook filter */}
            <select
              value={webhookFilter}
              onChange={e => setWebhookFilter(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-purple-500"
            >
              <option value="all">All webhooks</option>
              {(webhooks as any[] ?? []).map((w: any) => (
                <option key={w.id} value={w.id}>{w.url.replace(/^https?:\/\//, "").slice(0, 40)}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh" onClick={() => refetch()}
              className="h-7 w-7 text-slate-400 hover:text-white"
            ><RefreshCw/>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="divide-y divide-slate-700">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex gap-4">
                <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
                <div className="h-4 w-32 bg-slate-700 rounded animate-pulse" />
                <div className="h-4 w-16 bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <AlertOctagon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No webhook deliveries yet</p>
            <p className="text-xs mt-1">Deliveries appear here once your webhooks receive events</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {rows.map((d: any) => (
              <div key={d.id} className="hover:bg-slate-700/20 transition-colors">
                {/* Row summary */}
                <button
                  className="w-full text-left p-4 flex items-center gap-4"
                  onClick={() => toggleExpand(d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                        {d.eventType}
                      </span>
                      <DeliveryStatusBadge status={d.status} responseStatus={d.responseStatus} />
                      {d.latencyMs != null && (
                        <span className="text-[10px] text-slate-500 font-mono">{d.latencyMs}ms</span>
                      )}
                      {d.attemptCount > 1 && (
                        <span className="text-[10px] text-amber-400">{d.attemptCount} attempts</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(d.status === "failed" || d.status === "pending") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e: any) => handleRetry(d.id, e)}
                        disabled={retryingId === d.id}
                        className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20"
                      >
                        {retryingId === d.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3 mr-1" />
                        )}
                        {retryingId === d.id ? "Retrying…" : "Retry"}
                      </Button>
                    )}
                    {expandedId === d.id
                      ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </button>

                {/* Expanded payload inspector */}
                {expandedId === d.id && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wide">Request Payload</div>
                      <pre className="bg-[#0d1117] text-slate-300 p-3 rounded-lg border border-slate-700 text-[11px] font-mono overflow-x-auto max-h-48">
                        {JSON.stringify(d.payload, null, 2)}
                      </pre>
                    </div>
                    {d.responseBody && (
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wide">Response Body</div>
                        <pre className="bg-[#0d1117] text-slate-300 p-3 rounded-lg border border-slate-700 text-[11px] font-mono overflow-x-auto max-h-32">
                          {d.responseBody.slice(0, 2000)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-7 w-7 text-slate-400 hover:text-white">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

// ─── Code Block ───────────────────────────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="relative">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-lg border border-slate-700 border-b-0">
        <span className="text-xs text-slate-400 font-mono">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="bg-[#0d1117] text-slate-200 p-4 rounded-b-lg border border-slate-700 overflow-x-auto text-xs leading-relaxed font-mono max-h-96">
        {code}
      </pre>
    </div>
  );
}

// ─── Sandbox Runner ───────────────────────────────────────────────────────────

type RunResult = {
  status: "idle" | "running" | "success" | "error";
  message: string;
  data?: Record<string, unknown>;
};

function SandboxRunner({ mode }: { mode: EnvMode }) {
  const [amount, setAmount] = useState("5000");
  const [email, setEmail] = useState("sandbox@example.com");
  const [result, setResult] = useState<RunResult>({ status: "idle", message: "" });
  const [redeemEnabled, setRedeemEnabled] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState("100");

  // Fetch loyalty balance for the entered email
  const { data: loyaltyBalance } = trpc.customers.getLoyaltyBalance.useQuery(
    { customerId: email },
    { enabled: redeemEnabled && email.includes("@", { staleTime: 30_000 }), staleTime: 30_000 }
  );

  const createTest = trpc.transactions.createTest.useMutation({
    onSuccess: (data) => {
      setResult({
        status: "success",
        message: `Test charge succeeded`,
        data: {
          id: (data as any).id,
          reference: (data as any).reference,
          amount: `${((data as any).amount / 100).toFixed(2)} NGN`,
          status: (data as any).status,
          fee: `${((data as any).feeAmount / 100).toFixed(2)} NGN`,
          net: `${((data as any).netAmount / 100).toFixed(2)} NGN`,
        },
      });
      toast.success("Sandbox charge completed");
    },
    onError: (e: any) => {
      setResult({ status: "error", message: e.message });
      toast.error("Sandbox charge failed: " + e.message);
    },
  });

  const handleRun = () => {
    if (mode === "live") {
      toast.error("Switch to test mode to run sandbox charges");
      return;
    }
    const amountInt = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountInt) || amountInt < 100) {
      toast.error("Amount must be at least ₦1.00");
      return;
    }
    setResult({ status: "running", message: "Sending test charge…" });
    const pointsToRedeem = redeemEnabled ? Math.max(0, parseInt(redeemPoints) || 0) : 0;
    createTest.mutate({
      amount: amountInt,
      currency: "NGN",
      customerEmail: email,
      customerName: "Sandbox Customer",
      description: "Developer Portal sandbox test",
      channel: "card",
      ...(pointsToRedeem > 0 ? { redeemPoints: pointsToRedeem } : {}),
    });
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-base text-white flex items-center gap-2">
          <Play className="w-4 h-4 text-emerald-400" />
          Run in Sandbox
          {mode === "live" && (
            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] ml-1">
              <AlertTriangle className="w-2.5 h-2.5 mr-1" />
              Switch to test mode
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">
          Fire a real test charge against the PayGate sandbox. The transaction will appear in your
          Transactions dashboard with a <code className="bg-slate-700 px-1 rounded">TEST_</code> prefix.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-slate-300 text-xs">Amount (NGN)</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="5000"
              min="1"
              className="bg-slate-900 border-slate-600 text-white mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-slate-300 text-xs">Customer Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="sandbox@example.com"
              className="bg-slate-900 border-slate-600 text-white mt-1 h-8 text-sm"
            />
          </div>
        </div>

        {/* Loyalty Redemption Toggle */}
        <div className="rounded-lg border border-slate-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-slate-300 font-medium">Redeem Loyalty Points</span>
              {loyaltyBalance && (
                <span className="text-xs text-amber-400 font-mono">
                  ({loyaltyBalance.balance?.toLocaleString() ?? "—"} pts available)
                </span>
              )}
            </div>
            <button
              onClick={() => setRedeemEnabled(p => !p)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                redeemEnabled ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-400"
              }`}
            >
              {redeemEnabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              {redeemEnabled ? "On" : "Off"}
            </button>
          </div>
          {redeemEnabled && (
            <div>
              <Label className="text-slate-400 text-xs">Points to Redeem</Label>
              <Input
                type="number"
                value={redeemPoints}
                onChange={e => setRedeemPoints(e.target.value)}
                min="1"
                placeholder="100"
                className="bg-slate-900 border-slate-600 text-white mt-1 h-8 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Points will be deducted from the customer's loyalty balance and the equivalent value subtracted from the charge amount.
              </p>
            </div>
          )}
        </div>

        <Button
          onClick={handleRun}
          disabled={mode === "live" || result.status === "running"}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          {result.status === "running" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
          ) : (
            <><Play className="w-4 h-4" /> Run Test Charge</>
          )}
        </Button>

        {/* Result */}
        {result.status !== "idle" && result.status !== "running" && (
          <div className={`rounded-lg p-3 border ${
            result.status === "success"
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-red-500/10 border-red-500/20"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.status === "success"
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <XCircle className="w-4 h-4 text-red-400" />}
              <span className={`text-sm font-medium ${
                result.status === "success" ? "text-emerald-400" : "text-red-400"
              }`}>
                {result.message}
              </span>
            </div>
            {result.data && (
              <pre className="text-xs text-slate-300 font-mono bg-slate-900/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeveloperPortal() {
  const [activeSample, setActiveSample] = useState<keyof typeof SAMPLES>("Charge a Card");
  const [activeLang, setActiveLang] = useState<LangId>("go");
  const [envMode, setEnvMode] = useState<EnvMode>("test");
  const [testKey, setTestKey] = useState("sk_test_••••••••••••••••");
  const [liveKey, setLiveKey] = useState("sk_live_••••••••••••••••");

  // Load the user's API keys
  const { data: apiKeysData } = trpc.apiKeys.list.useQuery();

  useEffect(() => {
    const keys = (apiKeysData as any[]) ?? [];
    const testK = keys.find((k: any) => k.environment === "test" && k.isActive);
    const liveK = keys.find((k: any) => k.environment === "live" && k.isActive);
    if (testK?.keyPrefix) setTestKey(testK.keyPrefix + "••••••••••••••••");
    if (liveK?.keyPrefix) setLiveKey(liveK.keyPrefix + "••••••••••••••••");
  }, [apiKeysData]);

  const activeKey = envMode === "test" ? testKey : liveKey;
  const sampleFn = SAMPLES[activeSample][activeLang] as (key: string) => string;
  const code = sampleFn(activeKey);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-6 h-6 text-indigo-400" />
            Developer Portal
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            SDK documentation, live code samples, and API reference
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">v2.1.0</Badge>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">REST + tRPC</Badge>
        </div>
      </div>

      {/* Environment Toggle */}
      <Card className={`border ${envMode === "test" ? "bg-amber-500/5 border-amber-500/20" : "bg-red-500/5 border-red-500/20"}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${envMode === "test" ? "bg-amber-400" : "bg-red-400"} animate-pulse`} />
              <div>
                <p className="text-sm font-semibold text-white">
                  {envMode === "test" ? "Test Mode" : "Live Mode"}
                </p>
                <p className="text-xs text-slate-400">
                  {envMode === "test"
                    ? "Using test API key — transactions are simulated, no real money moves"
                    : "Using live API key — real transactions will be processed"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <code className="text-xs text-slate-300 font-mono">{activeKey.slice(0, 22)}…</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnvMode(m => m === "test" ? "live" : "test")}
                className={`gap-2 border ${
                  envMode === "test"
                    ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 bg-transparent"
                    : "border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent"
                }`}
              >
                {envMode === "test"
                  ? <><ToggleLeft className="w-4 h-4" /> Switch to Live</>
                  : <><ToggleRight className="w-4 h-4" /> Switch to Test</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen, label: "API Reference", desc: "Full REST docs", color: "text-blue-400" },
          { icon: Key, label: "Authentication", desc: "API keys & OAuth", color: "text-amber-400" },
          { icon: Globe, label: "Cross-Border", desc: "Mojaloop & BRICS Pay", color: "text-emerald-400" },
          { icon: Shield, label: "Webhooks", desc: "Event signatures", color: "text-purple-400" },
        ].map(({ icon: Icon, label, desc, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700 hover:border-slate-500 transition-colors cursor-pointer group">
            <CardContent className="p-4">
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 mt-2 transition-colors" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Code Samples */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Live Code Samples
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Key className="w-3.5 h-3.5" />
              <span className="font-mono">{activeKey.slice(0, 20)}…</span>
              <Badge className={`text-[10px] ${
                envMode === "test"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}>
                {envMode}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sample selector */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((s: any) => (
              <Button
                key={s}
                variant={activeSample === s ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSample(s)}
                className={activeSample === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-700 text-slate-300 hover:text-white bg-transparent"}
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Language tabs */}
          <Tabs value={activeLang} onValueChange={(v: any) => setActiveLang(v as LangId)}>
            <TabsList className="bg-slate-900 border border-slate-700 h-9">
              {LANGUAGES.map((l: any) => (
                <TabsTrigger
                  key={l.id}
                  value={l.id}
                  className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400"
                >
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {LANGUAGES.map((l: any) => (
              <TabsContent key={l.id} value={l.id} className="mt-3">
                <CodeBlock
                  code={(SAMPLES[activeSample as keyof typeof SAMPLES][l.id as keyof (typeof SAMPLES)[keyof typeof SAMPLES]] as (key: string) => string)(activeKey)}
                  lang={l.label}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Sandbox Runner */}
      <SandboxRunner mode={envMode} />

      {/* API Reference */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            API Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-700/50">
            {API_ENDPOINTS.map((ep) => (
              <div key={ep.path} className="flex items-center gap-4 p-4 hover:bg-slate-700/30 transition-colors">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border font-mono flex-shrink-0 ${METHOD_COLORS[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="text-sm text-slate-200 font-mono flex-1">{ep.path}</code>
                <span className="text-sm text-slate-400 hidden md:block">{ep.desc}</span>
                {ep.auth && (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] flex-shrink-0">
                    <Key className="w-2.5 h-2.5 mr-1" />
                    Auth
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SDK Language Cards */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">SDK Packages</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { lang: "Go", pkg: "github.com/paygate-africa/paygate-go", install: "go get github.com/paygate-africa/paygate-go", color: "text-cyan-400", badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", desc: "Idiomatic Go client with context support, retries, and structured errors." },
            { lang: "Rust", pkg: "paygate-rs", install: 'paygate-rs = "0.3"', color: "text-orange-400", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", desc: "Async Rust client built on tokio + reqwest. Zero-copy deserialization." },
            { lang: "Python", pkg: "paygate-python", install: "pip install paygate-python", color: "text-yellow-400", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", desc: "Sync and async (httpx) client. Pydantic models for all responses." },
            { lang: "Node.js", pkg: "@paygate-africa/node", install: "npm install @paygate-africa/node", color: "text-green-400", badge: "bg-green-500/10 text-green-400 border-green-500/20", desc: "TypeScript-first SDK with full type inference and tree-shaking." },
            { lang: "PHP", pkg: "paygate-africa/paygate-php", install: "composer require paygate-africa/paygate-php", color: "text-purple-400", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20", desc: "PSR-18 compatible. Laravel integration included." },
            { lang: "Java", pkg: "africa.paygate:paygate-java", install: "<dependency>paygate-java:0.2.0</dependency>", color: "text-red-400", badge: "bg-red-500/10 text-red-400 border-red-500/20", desc: "Spring Boot auto-configuration. Reactive WebClient support." },
          ].map(({ lang, pkg, install, color, badge, desc }) => (
            <Card key={lang} className="bg-slate-800/50 border-slate-700 hover:border-slate-500 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-sm ${color}`}>{lang}</span>
                  <Badge className={`text-[10px] border ${badge}`}>{pkg.split("/").pop()}</Badge>
                </div>
                <p className="text-xs text-slate-400">{desc}</p>
                <div className="bg-slate-900 rounded px-3 py-2 flex items-center justify-between gap-2">
                  <code className="text-xs text-slate-300 font-mono truncate">{install}</code>
                  <CopyButton text={install} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Webhook Event Log */}
      <WebhookEventLog />

      {/* Middleware Architecture */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            Middleware Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Go Mojaloop Adapter", lang: "Go", color: "text-cyan-400", badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", items: ["DFSP registration & discovery", "FSPIOP quote/transfer flow", "ILP packet construction", "Cross-border settlement"] },
              { title: "Rust BRICS Pay Signer", lang: "Rust", color: "text-orange-400", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", items: ["RSA-PSS-SHA256 signing", "ECDSA P-256 signing", "DCMS message packaging", "HMAC-SHA256 USSD tokens"] },
              { title: "Python ML Services", lang: "Python", color: "text-yellow-400", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", items: ["Real-time fraud scoring", "USSD session gateway", "M-Pesa STK Push", "B2C disbursements"] },
            ].map(({ title, lang, color, badge, items }) => (
              <div key={title} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <Badge className={`text-[10px] border ${badge}`}>{lang}</Badge>
                </div>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-slate-400">
                      <div className={`w-1.5 h-1.5 rounded-full bg-current ${color} flex-shrink-0`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
