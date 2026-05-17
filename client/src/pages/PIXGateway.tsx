// PIXGateway.tsx
// Brazil PIX instant payment gateway — key validation, QR code display, and transfer initiation.

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, AlertCircle,
  QrCode, DollarSign, Globe, Zap, Copy,
} from "lucide-react";
import { Link } from "wouter";

type PixKeyType = "cpf" | "cnpj" | "phone" | "email" | "random";

const KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF (Individual Tax ID)",
  cnpj: "CNPJ (Business Tax ID)",
  phone: "Phone Number",
  email: "Email Address",
  random: "Random Key (EVP)",
};

const KEY_TYPE_PLACEHOLDERS: Record<PixKeyType, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  phone: "+55 11 99999-9999",
  email: "receiver@email.com",
  random: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
};

function QRCodeDisplay({ pixKey, amount, currency }: { pixKey: string; amount: string; currency: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  // EMV-style PIX payload (simplified BR Code format)
  const pixPayload = [
    "000201",                          // Payload Format Indicator
    "010212",                          // Point of Initiation Method: dynamic
    `26${String(pixKey.length + 14).padStart(2, "0")}0014BR.GOV.BCB.PIX01${String(pixKey.length).padStart(2, "0")}${pixKey}`,
    "52040000",                        // Merchant Category Code
    "5303986",                         // Transaction Currency: BRL
    amount ? `54${String(parseFloat(amount).toFixed(2).length).padStart(2, "0")}${parseFloat(amount).toFixed(2)}` : "",
    "5802BR",                          // Country Code
    "5913PayGate PIX",                 // Merchant Name
    "6009SAO PAULO",                   // Merchant City
    "62070503***",                     // Additional Data
    "6304",                            // CRC placeholder
  ].join("");

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pixPayload, {
      width: 200,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    }).catch(err => setError(err.message));
  }, [pixPayload]);

  if (error) {
    return <p className="text-xs text-destructive">QR generation failed: {error}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-4 bg-white rounded-xl border border-border shadow-sm">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Scan with any Brazilian banking app to pay<br />
        <span className="font-mono font-semibold">{parseFloat(amount || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {currency}</span>
      </p>
    </div>
  );
}

export default function PIXGateway() {
  const [sourceCurrency, setSourceCurrency] = useState("NGN");
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [keyType, setKeyType] = useState<PixKeyType>("random");
  const [showQR, setShowQR] = useState(false);
  const [step, setStep] = useState<"input" | "validate" | "quote" | "done">("input");

  const validateQuery = trpc.crossBorder.pix.validateKey.useQuery(
    { pixKey, keyType },
    { enabled: step === "validate" && pixKey.length >= 3 }, staleTime: 30_000})

  const quoteQuery = trpc.crossBorder.pix.getQuote.useQuery(
    { sourceCurrency, amount: amount || "0" },
    { enabled: step === "quote" && !!amount && parseFloat(amount, { staleTime: 30_000 }) > 0 }
  );

  const initiateMutation = trpc.crossBorder.initiate.useMutation({
    onSuccess: () => {
      setStep("done");
      toast.success("PIX transfer initiated!");
    },
    onError: (err) => toast.error(err.message),
  });

  const keyResult = validateQuery.data;
  const quote = quoteQuery.data;

  const handleValidate = () => {
    if (!pixKey || pixKey.length < 3) { toast.error("Enter a valid PIX key"); return; }
    setStep("validate");
  };

  const handleGetQuote = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setStep("quote");
  };

  const handleInitiate = () => {
    if (!quote || !keyResult?.valid) return;
    initiateMutation.mutate({
      sourceCurrency,
      targetCurrency: "BRL",
      amount,
      rail: "pix",
      receiverId: pixKey,
      receiverIdType: keyType.toUpperCase(),
      corridor: `${sourceCurrency}_BRL`,
      receiverName: keyResult.name ?? "PIX Receiver",
      idempotencyKey: `pix_${Date.now()}`,
    });
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(pixKey);
    toast.success("PIX key copied!");
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/cross-border">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cross-Border
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🇧🇷 PIX Gateway
          </h1>
          <p className="text-sm text-muted-foreground">Brazil Instant Payment System · BRL transfers</p>
        </div>
        <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3">
        <QrCode className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-800">PIX — Brazil's Instant Payment System</p>
          <p className="text-xs text-green-700 mt-0.5">
            Instant BRL transfers using PIX keys (CPF, CNPJ, phone, email, or random EVP key).
            Available 24/7, settlement in seconds. Operated by Banco Central do Brasil.
          </p>
        </div>
      </div>

      {step === "done" ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-700">PIX Transfer Sent</h2>
            <p className="text-sm text-muted-foreground">
              Your PIX transfer to <span className="font-mono font-semibold">{pixKey}</span> has been initiated.
              Funds will arrive in the recipient's account within seconds.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep("input"); setAmount(""); setPixKey(""); setShowQR(false); }}>
                New Transfer
              </Button>
              <Link href="/cross-border">
                <Button>View All Transfers</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Step 1: PIX Key */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <QrCode className="w-4 h-4 text-green-600" />
                Step 1: PIX Key
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Key Type</label>
                <select
                  value={keyType}
                  onChange={e => { setKeyType(e.target.value as PixKeyType); if (step !== "input") setStep("input"); }}
                  className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(Object.keys(KEY_TYPE_LABELS) as PixKeyType[]).map(k => (
                    <option key={k} value={k}>{KEY_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">PIX Key</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={pixKey}
                    onChange={e => { setPixKey(e.target.value); if (step !== "input") setStep("input"); }}
                    placeholder={KEY_TYPE_PLACEHOLDERS[keyType]}
                    className="flex-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  {pixKey && (
                    <Button variant="outline" size="sm" aria-label="Copy" onClick={handleCopyKey}><Copy/>
                    </Button>
                  )}
                </div>
              </div>

              {step === "input" && (
                <Button className="w-full" onClick={handleValidate}>
                  Validate PIX Key
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}

              {(step === "validate" || step === "quote") && keyResult && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${keyResult.valid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {keyResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {keyResult.valid ? `Key verified: ${keyResult.name}` : "PIX key not found or inactive"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Amount + Quote */}
          {(step === "validate" || step === "quote") && keyResult?.valid && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  Step 2: Amount & Quote
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Source Currency</label>
                    <select
                      value={sourceCurrency}
                      onChange={e => { setSourceCurrency(e.target.value); if (step === "quote") setStep("validate"); }}
                      className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="NGN">NGN — Nigerian Naira</option>
                      <option value="KES">KES — Kenyan Shilling</option>
                      <option value="USD">USD — US Dollar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Amount</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); if (step === "quote") setStep("validate"); }}
                      placeholder="e.g. 200000"
                      className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    />
                  </div>
                </div>

                {step === "validate" && (
                  <Button className="w-full" onClick={handleGetQuote}>
                    Get PIX Quote
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}

                {step === "quote" && (
                  <>
                    {quoteQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Fetching live PIX rate…
                      </div>
                    ) : quote ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                          <p className="text-sm font-semibold">Quote Summary</p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">You Send</p>
                              <p className="font-semibold">{parseFloat(amount).toLocaleString()} {sourceCurrency}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Recipient Gets</p>
                              <p className="font-semibold text-emerald-700">R${parseFloat(quote.target_amount).toLocaleString()} BRL</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Exchange Rate</p>
                              <p className="font-mono text-xs">1 {sourceCurrency} = {parseFloat(quote.exchange_rate).toFixed(6)} BRL</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">PIX Fee</p>
                              <p className="font-semibold text-amber-700">{parseFloat(quote.fee).toLocaleString()} {sourceCurrency}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">Valid until {new Date(quote.expires_at).toLocaleTimeString()}</p>
                        </div>

                        {/* QR Code */}
                        <div className="flex flex-col items-center justify-center">
                          {showQR ? (
                            <QRCodeDisplay pixKey={pixKey} amount={amount} currency={sourceCurrency} />
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setShowQR(true)}>
                              <QrCode className="w-4 h-4 mr-2" />
                              Show QR Code
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep("validate")}>
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleInitiate}
                        disabled={!quote || initiateMutation.isPending}
                      >
                        {initiateMutation.isPending ? (
                          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                        ) : (
                          <><Zap className="w-4 h-4 mr-2" />Send via PIX</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* PIX Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            About PIX
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>PIX is Brazil's instant payment ecosystem created by Banco Central do Brasil. It processes over 4 billion transactions per month with average settlement time under 10 seconds.</p>
          <p className="mt-2">PIX keys can be: CPF/CNPJ (tax IDs), phone number, email, or a random EVP key. All key types are registered in the DICT (Diretório de Identificadores de Contas Transacionais).</p>
        </CardContent>
      </Card>
    </div>
  );
}
