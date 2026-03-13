/**
 * Bill Pay Page (Consumer)
 * Adapted from PayGate PWA archive.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Wifi, Phone, Tv, Droplets, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

type BillCategory = { id: string; label: string; icon: React.ElementType; color: string };

const BILL_CATEGORIES: BillCategory[] = [
  { id: "electricity", label: "Electricity", icon: Zap, color: "text-amber-500" },
  { id: "internet", label: "Internet", icon: Wifi, color: "text-blue-500" },
  { id: "airtime", label: "Airtime", icon: Phone, color: "text-emerald-500" },
  { id: "cable", label: "Cable TV", icon: Tv, color: "text-purple-500" },
  { id: "water", label: "Water", icon: Droplets, color: "text-cyan-500" },
];

export default function BillPay() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"select" | "form" | "success">("select");

  const createTx = trpc.transactions.createTest.useMutation({
    onSuccess: () => setStep("success"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handlePay = () => {
    if (!accountNumber || !amount) {
      toast.error("Please fill in all fields");
      return;
    }
    createTx.mutate({
      amount: parseFloat(amount) * 100,
      currency: "USD",
      channel: "ussd",
      description: `${selected} bill payment for ${accountNumber}`,
    });
  };

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Bill Paid!</h2>
          <p className="text-muted-foreground capitalize">
            Your {selected} bill of ${parseFloat(amount).toFixed(2)} has been paid successfully.
          </p>
          <Button className="w-full" onClick={() => navigate("/consumer")}>Back to Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 pt-4">
        <Button variant="ghost" size="icon" onClick={() => step === "form" ? setStep("select") : navigate("/consumer")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Bill Pay</h1>
          <p className="text-sm text-muted-foreground">Pay your bills instantly</p>
        </div>
      </div>

      {step === "select" && (
        <div className="grid grid-cols-2 gap-3">
          {BILL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setSelected(cat.id); setStep("form"); }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <cat.icon className={`w-6 h-6 ${cat.color}`} />
              </div>
              <span className="font-medium text-sm">{cat.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === "form" && selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize flex items-center gap-2">
              {(() => {
                const cat = BILL_CATEGORIES.find((c) => c.id === selected);
                return cat ? <cat.icon className={`w-5 h-5 ${cat.color}`} /> : null;
              })()}
              {selected} Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Account / Meter Number</Label>
              <Input
                placeholder="Enter account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {["10", "20", "50", "100"].map((preset) => (
                <Badge
                  key={preset}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => setAmount(preset)}
                >
                  ${preset}
                </Badge>
              ))}
            </div>
            <Button className="w-full gap-2" onClick={handlePay} disabled={createTx.isPending}>
              {createTx.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {createTx.isPending ? "Processing…" : "Pay Now"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
