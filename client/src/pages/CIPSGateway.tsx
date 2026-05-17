// CIPSGateway.tsx
// China Interbank Payment System (CIPS) cross-border payment page.
// Supports CNY quote, receiver validation, and transfer initiation.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, AlertCircle,
  Building2, DollarSign, Globe, Zap,
} from "lucide-react";
import { Link } from "wouter";

const CIPS_BANKS = [
  { code: "ICBKCNBJ", name: "ICBC (Industrial & Commercial Bank of China)" },
  { code: "BKCHCNBJ", name: "Bank of China" },
  { code: "ABOCCNBJ", name: "Agricultural Bank of China" },
  { code: "PCBCCNBJ", name: "China Construction Bank" },
  { code: "BOFACNBJ", name: "Bank of Communications" },
  { code: "CMBCCNBS", name: "China Merchants Bank" },
];

export default function CIPSGateway() {
  const [sourceCurrency, setSourceCurrency] = useState("NGN");
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [step, setStep] = useState<"input" | "quote" | "confirm" | "done">("input");

  const quoteQuery = trpc.crossBorder.cips.getQuote.useQuery(
    { sourceCurrency, amount: amount || "0", receiverBankCode: bankCode || undefined },
    { enabled: step === "quote" && !!amount && parseFloat(amount, { staleTime: 30_000 }) > 0 }
  );

  const validateQuery = trpc.crossBorder.cips.validateReceiver.useQuery(
    { bankCode, accountNumber },
    { enabled: step === "quote" && !!bankCode && accountNumber.length >= 16 , staleTime: 30_000 })

  const initiateMutation = trpc.crossBorder.initiate.useMutation({
    onSuccess: () => {
      setStep("done");
      toast.success("CIPS transfer initiated successfully!");
    },
    onError: (err) => toast.error(err.message),
  });

  const quote = quoteQuery.data;
  const receiver = validateQuery.data;

  const handleGetQuote = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (!bankCode) { toast.error("Select a receiving bank"); return; }
    if (accountNumber.length < 16) { toast.error("Enter a valid account number (16–19 digits)"); return; }
    setStep("quote");
  };

  const handleInitiate = () => {
    if (!quote) return;
    initiateMutation.mutate({
      sourceCurrency,
      targetCurrency: "CNY",
      amount,
      rail: "cips",
      receiverId: accountNumber,
      receiverIdType: "ACCOUNT",
      corridor: `${sourceCurrency}_CNY`,
      receiverName: CIPS_BANKS.find(b => b.code === bankCode)?.name ?? "CIPS Receiver",
      idempotencyKey: `cips_${Date.now()}`,
    });
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
            🇨🇳 CIPS Gateway
          </h1>
          <p className="text-sm text-muted-foreground">China Interbank Payment System · CNY transfers</p>
        </div>
        <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
        <Globe className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-800">CIPS — China's Cross-Border RMB Infrastructure</p>
          <p className="text-xs text-red-700 mt-0.5">
            Processes cross-border CNY payments between African and Chinese financial institutions.
            Settlement T+0 for same-day windows, T+1 otherwise. Minimum transfer: ¥1,000 CNY.
          </p>
        </div>
      </div>

      {step === "done" ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-700">Transfer Initiated</h2>
            <p className="text-sm text-muted-foreground">
              Your CIPS transfer has been submitted. You will receive a confirmation email once the funds are processed by the Chinese correspondent bank.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep("input"); setAmount(""); setAccountNumber(""); }}>
                New Transfer
              </Button>
              <Link href="/cross-border">
                <Button>View All Transfers</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-red-600" />
              {step === "input" ? "Transfer Details" : step === "quote" ? "Review Quote" : "Confirm Transfer"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Source */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Source Currency</label>
                <select
                  value={sourceCurrency}
                  onChange={e => setSourceCurrency(e.target.value)}
                  disabled={step !== "input"}
                  className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="NGN">NGN — Nigerian Naira</option>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="GHS">GHS — Ghanaian Cedi</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 500000"
                  disabled={step !== "input"}
                  className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 font-mono"
                />
              </div>
            </div>

            {/* Receiver Bank */}
            <div>
              <label className="text-sm font-medium">Receiving Bank (CIPS Member)</label>
              <select
                value={bankCode}
                onChange={e => setBankCode(e.target.value)}
                disabled={step !== "input"}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                <option value="">Select a CIPS member bank</option>
                {CIPS_BANKS.map(b => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Account Number */}
            <div>
              <label className="text-sm font-medium">Receiver Account Number</label>
              <input
                type="text"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="16–19 digit account number"
                maxLength={19}
                disabled={step !== "input"}
                className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 font-mono"
              />
            </div>

            {/* Quote Result */}
            {step === "quote" && (
              <div className="space-y-3">
                {quoteQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Fetching live CIPS quote…
                  </div>
                ) : quote ? (
                  <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                    <p className="text-sm font-semibold text-foreground">Quote Summary</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">You Send</p>
                        <p className="font-semibold">{parseFloat(amount).toLocaleString()} {sourceCurrency}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Recipient Gets</p>
                        <p className="font-semibold text-emerald-700">¥{parseFloat(quote.target_amount).toLocaleString()} CNY</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Exchange Rate</p>
                        <p className="font-mono text-xs">1 {sourceCurrency} = {parseFloat(quote.exchange_rate).toFixed(6)} CNY</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">CIPS Fee</p>
                        <p className="font-semibold text-amber-700">{parseFloat(quote.fee).toLocaleString()} {sourceCurrency}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Quote valid until {new Date(quote.expires_at).toLocaleTimeString()}</p>
                  </div>
                ) : null}

                {validateQuery.data && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${receiver?.valid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {receiver?.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {receiver?.valid ? `Account verified: ${receiver.accountNumber}` : "Account validation failed"}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {step === "input" && (
                <Button className="flex-1" onClick={handleGetQuote}>
                  Get Quote
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              {step === "quote" && (
                <>
                  <Button variant="outline" onClick={() => setStep("input")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleInitiate}
                    disabled={!quote || initiateMutation.isPending || quoteQuery.isLoading}
                  >
                    {initiateMutation.isPending ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" />Confirm & Send via CIPS</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CIPS Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            About CIPS
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>CIPS (Cross-Border Interbank Payment System) is China's dedicated infrastructure for cross-border RMB transactions, operated by the People's Bank of China.</p>
          <p className="mt-2">Settlement windows: 08:00–20:00 CST (same-day), 20:00–08:00 CST (next-day). Supported currencies: CNY, HKD, USD.</p>
        </CardContent>
      </Card>
    </div>
  );
}
