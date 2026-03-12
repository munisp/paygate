/**
 * PayGate Developer Portal
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides SDK documentation, live API key injection into code samples,
 * and integration guides for Go, Rust, Python, Node.js, and cURL.
 */
import { useState, useEffect } from "react";
import { Copy, Check, Code2, Key, BookOpen, Zap, Globe, Shield, Terminal, ChevronRight, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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
    CardNumber  string \`json:"card_number"\`
    Expiry      string \`json:"expiry"\`
    CVV         string \`json:"cvv"\`
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

// Usage
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

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

const apiKey = "${key}"

// InitiateCrossBorderTransfer sends money across borders via Mojaloop or BRICS Pay.
func InitiateCrossBorderTransfer(
    receiverMSISDN, corridor, sourceCurrency, targetCurrency string,
    amount float64,
) (string, error) {
    payload := map[string]any{
        "receiver_id":       receiverMSISDN,
        "receiver_id_type":  "MSISDN",
        "corridor":          corridor,
        "source_currency":   sourceCurrency,
        "target_currency":   targetCurrency,
        "amount":            amount,
        "rail":              "mojaloop",
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
    fmt.Printf("Transfer ID: %v\\n", result["transfer_id"])
    return result["transfer_id"].(string), nil
}`,
    rust: (key: string) => `use reqwest::Client;
use serde_json::json;

const API_KEY: &str = "${key}";

/// Initiate a cross-border transfer via the PayGate Mojaloop adapter.
/// Supports corridors: NGN-KES, NGN-GHS, NGN-ZAR, NGN-USD, BRL-USD, etc.
pub async fn initiate_cross_border(
    receiver_msisdn: &str,
    corridor: &str,
    amount: f64,
) -> Result<String, Box<dyn std::error::Error>> {
    let (source, target) = corridor.split_once('-')
        .ok_or("Invalid corridor format")?;

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
            "amount": amount.to_string(),
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
    """
    Initiate a cross-border transfer via PayGate.

    Args:
        receiver_msisdn: Recipient phone number (E.164 format)
        corridor: Payment corridor e.g. 'NGN-KES', 'NGN-USD'
        amount: Transfer amount in source currency
        rail: Payment rail ('mojaloop', 'brics_pay', 'swift')
    """
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
    return TransferResult(
        transfer_id=data["transfer_id"],
        status=data["status"],
        source_amount=float(data["source_amount"]),
        target_amount=float(data["target_amount"]),
        exchange_rate=float(data["exchange_rate"]),
    )`,
    node: (key: string) => `const API_KEY = "${key}";

/**
 * Initiate a cross-border transfer via PayGate.
 * Supports Mojaloop FSPIOP, BRICS Pay, and SWIFT GPI rails.
 *
 * @param {string} receiverMsisdn - Recipient phone (E.164)
 * @param {string} corridor - e.g. "NGN-KES"
 * @param {number} amount - Amount in source currency
 * @param {string} [rail="mojaloop"] - Payment rail
 */
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

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "io"
    "net/http"
)

// VerifyWebhookSignature validates the HMAC-SHA256 signature on incoming webhooks.
// The secret is your webhook signing secret from the PayGate dashboard.
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

func WebhookHandler(w http.ResponseWriter, r *http.Request) {
    body, ok := VerifyWebhookSignature(r, "${key}")
    if !ok {
        http.Error(w, "Invalid signature", http.StatusUnauthorized)
        return
    }
    fmt.Printf("Verified webhook: %s\\n", body)
    w.WriteHeader(http.StatusOK)
}`,
    rust: (key: string) => `use hmac::{Hmac, Mac};
use sha2::Sha256;
use hex;

type HmacSha256 = Hmac<Sha256>;

const WEBHOOK_SECRET: &str = "${key}";

/// Verify a PayGate webhook signature (HMAC-SHA256).
pub fn verify_webhook_signature(
    payload: &[u8],
    signature_header: &str,
) -> bool {
    let expected = signature_header.strip_prefix("sha256=")
        .unwrap_or("");

    let mut mac = HmacSha256::new_from_slice(WEBHOOK_SECRET.as_bytes())
        .expect("HMAC init failed");
    mac.update(payload);
    let result = mac.finalize().into_bytes();
    let computed = hex::encode(result);

    // Constant-time comparison
    computed.as_bytes().iter()
        .zip(expected.as_bytes().iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}`,
    python: (key: string) => `import hashlib
import hmac

WEBHOOK_SECRET = "${key}"

def verify_webhook_signature(payload: bytes, signature_header: str) -> bool:
    """
    Verify a PayGate webhook HMAC-SHA256 signature.

    Args:
        payload: Raw request body bytes
        signature_header: Value of X-PayGate-Signature header

    Returns:
        True if signature is valid, False otherwise
    """
    expected = signature_header.removeprefix("sha256=")
    computed = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, expected)

# FastAPI example
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()

@app.post("/webhooks/paygate")
async def handle_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("X-PayGate-Signature", "")
    if not verify_webhook_signature(payload, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")
    # Process event...
    return {"status": "ok"}`,
    node: (key: string) => `const crypto = require("crypto");

const WEBHOOK_SECRET = "${key}";

/**
 * Verify a PayGate webhook HMAC-SHA256 signature.
 * Use this in your Express/Fastify webhook handler.
 */
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
}

// Express middleware
app.post("/webhooks/paygate",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["x-paygate-signature"];
    if (!verifyWebhookSignature(req.body, sig)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    const event = JSON.parse(req.body);
    console.log("Event:", event.type);
    res.json({ received: true });
  }
);`,
    curl: (_key: string) => `# Webhooks are server-to-server callbacks — no cURL sample needed.
# Configure your webhook endpoint in the PayGate dashboard under Webhooks.
# PayGate will POST events to your URL with:
#   Content-Type: application/json
#   X-PayGate-Signature: sha256=<hmac_hex>
#
# Test a webhook delivery:
curl -X POST https://api.paygate.africa/v1/webhooks/{webhook_id}/test \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
  },
};

// ─── Language Config ──────────────────────────────────────────────────────────

const LANGUAGES = [
  { id: "go", label: "Go", color: "text-cyan-400", badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { id: "rust", label: "Rust", color: "text-orange-400", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { id: "python", label: "Python", color: "text-yellow-400", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { id: "node", label: "Node.js", color: "text-green-400", badge: "bg-green-500/10 text-green-400 border-green-500/20" },
  { id: "curl", label: "cURL", color: "text-slate-300", badge: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
] as const;

type LangId = typeof LANGUAGES[number]["id"];

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
      <pre className="bg-[#0d1117] text-slate-200 p-4 rounded-b-lg border border-slate-700 overflow-x-auto text-xs leading-relaxed font-mono">
        {code}
      </pre>
    </div>
  );
}

// ─── API Reference Cards ──────────────────────────────────────────────────────

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
  PUT: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  DELETE: "bg-red-500/10 text-red-400 border-red-500/20",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeveloperPortal() {
  const [activeSample, setActiveSample] = useState<keyof typeof SAMPLES>("Charge a Card");
  const [activeLang, setActiveLang] = useState<LangId>("go");
  const [liveKey, setLiveKey] = useState("pk_test_••••••••••••••••");

  // Load the user's first active API key
  const { data: apiKeysData } = trpc.apiKeys.list.useQuery();

  useEffect(() => {
    const keys = (apiKeysData as any[]) ?? [];
    const first = keys.find((k: any) => k.isActive);
    if (first?.keyPreview) setLiveKey(first.keyPreview);
    if (first?.key) setLiveKey(first.key);
  }, [apiKeysData]);

  const sampleFn = SAMPLES[activeSample][activeLang] as (key: string) => string;
  const code = sampleFn(liveKey);

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
        <div className="flex gap-2">
          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">v2.1.0</Badge>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">REST + tRPC</Badge>
        </div>
      </div>

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
              <span className="font-mono">{liveKey.slice(0, 20)}…</span>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">injected</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sample selector */}
          <div className="flex flex-wrap gap-2">
            {Object.keys(SAMPLES).map((s) => (
              <Button
                key={s}
                variant={activeSample === s ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSample(s as keyof typeof SAMPLES)}
                className={activeSample === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-700 text-slate-300 hover:text-white bg-transparent"}
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Language tabs */}
          <Tabs value={activeLang} onValueChange={(v) => setActiveLang(v as LangId)}>
            <TabsList className="bg-slate-900 border border-slate-700 h-9">
              {LANGUAGES.map((l) => (
                <TabsTrigger
                  key={l.id}
                  value={l.id}
                  className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400"
                >
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {LANGUAGES.map((l) => (
              <TabsContent key={l.id} value={l.id} className="mt-3">
                <CodeBlock
                  code={(SAMPLES[activeSample][l.id] as (key: string) => string)(liveKey)}
                  lang={l.label}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

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
            {
              lang: "Go",
              pkg: "github.com/paygate-africa/paygate-go",
              install: "go get github.com/paygate-africa/paygate-go",
              color: "text-cyan-400",
              badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
              desc: "Idiomatic Go client with context support, retries, and structured errors.",
            },
            {
              lang: "Rust",
              pkg: "paygate-rs",
              install: 'paygate-rs = "0.3"',
              color: "text-orange-400",
              badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",
              desc: "Async Rust client built on tokio + reqwest. Zero-copy deserialization.",
            },
            {
              lang: "Python",
              pkg: "paygate-python",
              install: "pip install paygate-python",
              color: "text-yellow-400",
              badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
              desc: "Sync and async (httpx) client. Pydantic models for all responses.",
            },
            {
              lang: "Node.js",
              pkg: "@paygate-africa/node",
              install: "npm install @paygate-africa/node",
              color: "text-green-400",
              badge: "bg-green-500/10 text-green-400 border-green-500/20",
              desc: "TypeScript-first SDK with full type inference and tree-shaking.",
            },
            {
              lang: "PHP",
              pkg: "paygate-africa/paygate-php",
              install: "composer require paygate-africa/paygate-php",
              color: "text-purple-400",
              badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
              desc: "PSR-18 compatible HTTP client. Laravel integration included.",
            },
            {
              lang: "Java",
              pkg: "africa.paygate:paygate-java",
              install: '<dependency>paygate-java:0.2.0</dependency>',
              color: "text-red-400",
              badge: "bg-red-500/10 text-red-400 border-red-500/20",
              desc: "Spring Boot auto-configuration. Reactive WebClient support.",
            },
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
              {
                title: "Go Mojaloop Adapter",
                lang: "Go",
                color: "text-cyan-400",
                badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
                items: ["DFSP registration & discovery", "FSPIOP quote/transfer flow", "ILP packet construction", "Cross-border settlement"],
              },
              {
                title: "Rust BRICS Pay Signer",
                lang: "Rust",
                color: "text-orange-400",
                badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                items: ["RSA-PSS-SHA256 signing", "ECDSA P-256 signing", "DCMS message packaging", "HMAC-SHA256 USSD tokens"],
              },
              {
                title: "Python ML Services",
                lang: "Python",
                color: "text-yellow-400",
                badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
                items: ["Real-time fraud scoring", "USSD session gateway", "M-Pesa STK Push", "B2C disbursements"],
              },
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
