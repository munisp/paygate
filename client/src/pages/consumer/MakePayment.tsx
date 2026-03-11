/**
 * Make Payment Page (Consumer)
 * Adapted from PayGate PWA archive.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Phone, Building2, CreditCard, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

type PaymentMethod = "phone" | "account" | "card";

export default function MakePayment() {
  const [, navigate] = useLocation();
  const [method, setMethod] = useState<PaymentMethod>("phone");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");

  const createTx = trpc.transactions.createTest.useMutation({
    onSuccess: () => setStep("success"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!recipient || !amount) {
      toast.error("Please fill in recipient and amount");
      return;
    }
    if (step === "form") {
      setStep("confirm");
      return;
    }
    createTx.mutate({
      amount: parseFloat(amount) * 100,
      currency: "USD",
      channel: "bank_transfer",
      description: note || `Payment to ${recipient}`,
      customerName: recipient,
    });
  };

  const methodOptions: { id: PaymentMethod; label: string; icon: React.ElementType; placeholder: string }[] = [
    { id: "phone", label: "Phone Number", icon: Phone, placeholder: "+1 (555) 000-0000" },
    { id: "account", label: "Bank Account", icon: Building2, placeholder: "Account number" },
    { id: "card", label: "Card Number", icon: CreditCard, placeholder: "•••• •••• •••• ••••" },
  ];

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Payment Sent!</h2>
          <p className="text-muted-foreground">
            ${parseFloat(amount).toFixed(2)} has been sent to {recipient}
          </p>
          <Button className="w-full" onClick={() => navigate("/consumer")}>Back to Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 pt-4">
        <Button variant="ghost" size="icon" onClick={() => step === "confirm" ? setStep("form") : navigate("/consumer")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {step === "confirm" ? "Confirm Payment" : "Make Payment"}
          </h1>
          <p className="text-sm text-muted-foreground">Send money instantly</p>
        </div>
      </div>

      {step === "form" && (
        <>
          {/* Method selector */}
          <div className="grid grid-cols-3 gap-2">
            {methodOptions.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                  method === m.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                }`}
              >
                <m.icon className={`w-5 h-5 ${method === m.id ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>{methodOptions.find((m) => m.id === method)?.label}</Label>
                <Input
                  placeholder={methodOptions.find((m) => m.id === method)?.placeholder}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7 text-lg font-semibold"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Input placeholder="What's this for?" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button className="w-full gap-2" onClick={handleSubmit}>
                <Send className="w-4 h-4" />Continue
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {step === "confirm" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review Payment</CardTitle>
            <CardDescription>Please confirm the details below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 bg-muted/40 rounded-xl p-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">To</span>
                <span className="font-medium">{recipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-bold text-lg">${parseFloat(amount).toFixed(2)}</span>
              </div>
              {note && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Note</span>
                  <span className="text-sm">{note}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Fee</span>
                <span className="text-sm text-emerald-600">Free</span>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={handleSubmit} disabled={createTx.isPending}>
              {createTx.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {createTx.isPending ? "Sending…" : "Confirm & Send"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
