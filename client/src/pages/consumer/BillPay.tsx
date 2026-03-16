/**
 * Bill Pay Page (Consumer)
 * Uses real consumerBills tRPC procedures — listCategories, listBillers, pay.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Zap, Wifi, Phone, Tv, Droplets, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const ICON_MAP: Record<string, React.ElementType> = {
  electricity: Zap,
  internet: Wifi,
  airtime: Phone,
  cable: Tv,
  water: Droplets,
};
const COLOR_MAP: Record<string, string> = {
  electricity: "text-amber-500",
  internet: "text-blue-500",
  airtime: "text-emerald-500",
  cable: "text-purple-500",
  water: "text-cyan-500",
};

export default function BillPay() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBiller, setSelectedBiller] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"select" | "form" | "success">("select");

  const utils = trpc.useUtils();

  const { data: categoriesData, isLoading: catsLoading } = trpc.consumerBills.listCategories.useQuery(undefined, { staleTime: 300_000 });
  const categories = categoriesData ?? [];

  const { data: billersData, isLoading: billersLoading } = trpc.consumerBills.listBillers.useQuery(
    { category: selected ?? "electricity" },
    { enabled: !!selected, staleTime: 300_000 }
  );
  const billers = billersData ?? [];

  const payBill = trpc.consumerBills.pay.useMutation({
    onSuccess: () => {
      setStep("success");
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handlePay = () => {
    if (!accountNumber || !amount || !selected || !selectedBiller) {
      toast.error("Please fill in all fields");
      return;
    }
    const amountKobo = Math.round(parseFloat(amount) * 100);
    if (amountKobo < 100) {
      toast.error("Minimum payment is ₦1");
      return;
    }
    payBill.mutate({
      category: selected,
      billerCode: selectedBiller,
      customerReference: accountNumber,
      amountKobo,
      currency: "NGN",
    });
  };

  if (step === "success") {
    const cat = categories.find((c) => c.code === selected);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Bill Paid!</h2>
          <p className="text-muted-foreground capitalize">
            Your {cat?.name ?? selected} bill of ₦{parseFloat(amount).toLocaleString()} has been paid successfully.
          </p>
          <Button className="w-full" onClick={() => { setStep("select"); setSelected(null); setSelectedBiller(""); setAccountNumber(""); setAmount(""); navigate("/consumer"); }}>
            Back to Wallet
          </Button>
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
        catsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => {
              const Icon = ICON_MAP[cat.code] ?? Zap;
              const color = COLOR_MAP[cat.code] ?? "text-primary";
              return (
                <button
                  key={cat.code}
                  onClick={() => { setSelected(cat.code); setSelectedBiller(""); setStep("form"); }}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Icon className={`w-6 h-6 ${color}`} />
                  </div>
                  <span className="font-medium text-sm">{cat.name}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {step === "form" && selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base capitalize flex items-center gap-2">
              {(() => {
                const Icon = ICON_MAP[selected] ?? Zap;
                const color = COLOR_MAP[selected] ?? "text-primary";
                return <Icon className={`w-5 h-5 ${color}`} />;
              })()}
              {categories.find(c => c.code === selected)?.name ?? selected} Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Biller selector */}
            <div className="space-y-1.5">
              <Label>Select Provider</Label>
              {billersLoading ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <Select value={selectedBiller} onValueChange={setSelectedBiller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {billers.map(b => (
                      <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Account / Meter / Phone Number</Label>
              <Input
                placeholder="Enter reference number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Amount (NGN)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {["500", "1000", "2000", "5000"].map((preset) => (
                <Badge
                  key={preset}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => setAmount(preset)}
                >
                  ₦{Number(preset).toLocaleString()}
                </Badge>
              ))}
            </div>

            <Button className="w-full gap-2" onClick={handlePay} disabled={payBill.isPending}>
              {payBill.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {payBill.isPending ? "Processing…" : "Pay Now"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
