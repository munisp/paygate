// UPIGateway.tsx
// India UPI (Unified Payments Interface) VPA validation + collect flow page.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, AlertCircle,
  Smartphone, DollarSign, Globe, Zap, Search,
} from "lucide-react";
import { Link } from "wouter";

const POPULAR_VPAS = [
  "merchant@ybl", "business@okaxis", "shop@paytm", "store@upi",
];

export default function UPIGateway() {
  const [sourceCurrency, setSourceCurrency] = useState("NGN");
  const [amount, setAmount] = useState("");
  const [vpa, setVpa] = useState("");
  const [step, setStep] = useState<"input" | "validate" | "quote" | "done">("input");

  const validateQuery = trpc.crossBorder.upi.validateVpa.useQuery(
    { vpa },
    { enabled: step === "validate" && vpa.includes("@") }
  );

  const quoteQuery = trpc.crossBorder.upi.getQuote.useQuery(
    { sourceCurrency, amount: amount || "0" },
    { enabled: step === "quote" && !!amount && parseFloat(amount) > 0 }
  );

  const initiateMutation = trpc.crossBorder.initiate.useMutation({
    onSuccess: () => {
      setStep("done");
      toast.success("UPI collect request sent!");
    },
    onError: (err) => toast.error(err.message),
  });

  const vpaResult = validateQuery.data;
  const quote = quoteQuery.data;

  const handleValidate = () => {
    if (!vpa || !vpa.includes("@")) { toast.error("Enter a valid UPI VPA (e.g. name@bank)"); return; }
    setStep("validate");
  };

  const handleGetQuote = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setStep("quote");
  };

  const handleInitiate = () => {
    if (!quote || !vpaResult?.valid) return;
    initiateMutation.mutate({
      sourceCurrency,
      targetCurrency: "INR",
      amount,
      rail: "upi",
      receiverId: vpa,
      receiverIdType: "VPA",
      corridor: `${sourceCurrency}_INR`,
      receiverName: vpaResult.name ?? vpa,
      idempotencyKey: `upi_${Date.now()}`,
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
            🇮🇳 UPI Gateway
          </h1>
          <p className="text-sm text-muted-foreground">Unified Payments Interface · INR transfers via VPA</p>
        </div>
        <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-orange-800">UPI — India's Real-Time Payment System</p>
          <p className="text-xs text-orange-700 mt-0.5">
            Send money directly to any UPI VPA (Virtual Payment Address). Instant settlement 24/7/365.
            Supported by 300+ Indian banks. Minimum transfer: ₹1 INR.
          </p>
        </div>
      </div>

      {step === "done" ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-700">UPI Collect Sent</h2>
            <p className="text-sm text-muted-foreground">
              A collect request has been sent to <span className="font-mono font-semibold">{vpa}</span>.
              The recipient will receive a notification to approve the payment.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep("input"); setAmount(""); setVpa(""); }}>
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
          {/* Step 1: VPA Validation */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-orange-600" />
                Step 1: Validate UPI VPA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">UPI VPA (Virtual Payment Address)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={vpa}
                    onChange={e => { setVpa(e.target.value.toLowerCase()); if (step !== "input") setStep("input"); }}
                    placeholder="name@bankname"
                    className="flex-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleValidate} disabled={validateQuery.isFetching}>
                    {validateQuery.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {POPULAR_VPAS.map(v => (
                    <button
                      key={v}
                      onClick={() => setVpa(v)}
                      className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {(step === "validate" || step === "quote") && vpaResult && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${vpaResult.valid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {vpaResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {vpaResult.valid ? `Verified: ${vpaResult.name}` : "VPA not found or inactive"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Amount + Quote */}
          {(step === "validate" || step === "quote") && vpaResult?.valid && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-orange-600" />
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
                      placeholder="e.g. 100000"
                      className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                    />
                  </div>
                </div>

                {step === "validate" && (
                  <Button className="w-full" onClick={handleGetQuote}>
                    Get UPI Quote
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}

                {step === "quote" && (
                  <>
                    {quoteQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Fetching live UPI rate…
                      </div>
                    ) : quote ? (
                      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                        <p className="text-sm font-semibold">Quote Summary</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">You Send</p>
                            <p className="font-semibold">{parseFloat(amount).toLocaleString()} {sourceCurrency}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Recipient Gets</p>
                            <p className="font-semibold text-emerald-700">₹{parseFloat(quote.target_amount).toLocaleString()} INR</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Exchange Rate</p>
                            <p className="font-mono text-xs">1 {sourceCurrency} = {parseFloat(quote.exchange_rate).toFixed(6)} INR</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">UPI Fee</p>
                            <p className="font-semibold text-amber-700">{parseFloat(quote.fee).toLocaleString()} {sourceCurrency}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Quote valid until {new Date(quote.expires_at).toLocaleTimeString()}</p>
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
                          <><Zap className="w-4 h-4 mr-2" />Send via UPI</>
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

      {/* UPI Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            About UPI
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>UPI is India's real-time payment system developed by NPCI (National Payments Corporation of India). It processes over 10 billion transactions per month.</p>
          <p className="mt-2">VPA format: <span className="font-mono">username@bankhandle</span> (e.g. john@okicici, shop@ybl). Instant settlement, 24/7 availability.</p>
        </CardContent>
      </Card>
    </div>
  );
}
