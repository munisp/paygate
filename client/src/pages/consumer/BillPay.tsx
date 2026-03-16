/**
 * Bill Pay Page (Consumer) - Wave 68
 * Full: category, biller, verify customer reference, PIN gate, bill history.
 * Uses actual API: listCategories (returns {code,name,icon}), listBillers (returns {code,name,logo}),
 * verify ({billerCode, customerReference}), pay ({category, billerCode, customerReference, amountKobo, variationCode}).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Zap, Wifi, Phone, Tv, Droplets, CheckCircle, Loader2, ArrowLeft, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const ICON_MAP: Record<string, React.ElementType> = {
  electricity: Zap, internet: Wifi, airtime: Phone, cable: Tv, water: Droplets, data: Wifi,
};
const COLOR_MAP: Record<string, string> = {
  electricity: "text-amber-500", internet: "text-blue-500", airtime: "text-emerald-500",
  cable: "text-purple-500", water: "text-cyan-500", data: "text-indigo-500",
};

function PinDialog({ open, onClose, onConfirm, isPending }: {
  open: boolean; onClose: () => void; onConfirm: (pin: string) => void; isPending: boolean;
}) {
  const [pin, setPin] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setPin(""); } }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Enter Transaction PIN</DialogTitle></DialogHeader>
        <div className="py-4">
          <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••"
            className="text-center text-2xl tracking-widest" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setPin(""); }} disabled={isPending}>Cancel</Button>
          <Button onClick={() => { if (pin.length !== 4) return; onConfirm(pin); setPin(""); }} disabled={pin.length !== 4 || isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Pay Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillHistory() {
  const { data, isLoading } = trpc.consumerBills.history.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const bills = (data as any)?.rows ?? data ?? [];
  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;
  if (!bills.length) return (
    <div className="text-center py-12 text-muted-foreground">
      <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>No bill payments yet</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {bills.map((b: any) => (
        <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
          <div>
            <p className="text-sm font-medium">{b.billerName ?? b.billerId ?? b.billerCode}</p>
            <p className="text-xs text-muted-foreground">{b.customerReference ?? b.accountNumber} · {new Date(b.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">&#8358;{(b.amountKobo / 100).toLocaleString()}</p>
            <Badge variant={b.status === "success" ? "default" : "destructive"} className="text-[10px]">{b.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BillPay() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBillerCode, setSelectedBillerCode] = useState<string>("");
  const [selectedBillerName, setSelectedBillerName] = useState<string>("");
  const [customerReference, setCustomerReference] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"select" | "form" | "verify" | "pin" | "success">("select");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [txRef, setTxRef] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: categoriesData, isLoading: catsLoading } = trpc.consumerBills.listCategories.useQuery(undefined, { staleTime: 300_000 });
  const categories = categoriesData ?? [];

  const { data: billersData, isLoading: billersLoading } = trpc.consumerBills.listBillers.useQuery(
    { category: selectedCategory ?? "electricity" },
    { enabled: !!selectedCategory, staleTime: 300_000 }
  );
  const billers = billersData ?? [];

  const verifyMutation = trpc.consumerBills.verify.useMutation({
    onSuccess: (data: any) => {
      setVerifiedName(data.customerName ?? "Verified");
      setStep("verify");
    },
    onError: (e) => toast.error("Verification failed: " + e.message),
  });

  const payBill = trpc.consumerBills.pay.useMutation({
    onSuccess: (data: any) => {
      setTxRef(data.reference);
      setStep("success");
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleVerify = () => {
    if (!selectedBillerCode || !customerReference) { toast.error("Please fill all fields"); return; }
    verifyMutation.mutate({ billerCode: selectedBillerCode, customerReference });
  };

  const handlePay = (pin: string) => {
    payBill.mutate({
      category: selectedCategory!,
      billerCode: selectedBillerCode,
      customerReference,
      amountKobo: Math.round(parseFloat(amount) * 100),
    });
  };

  if (step === "success") {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Payment Successful!</h2>
          <p className="text-muted-foreground text-sm mt-1">&#8358;{parseFloat(amount).toLocaleString()} paid to {selectedBillerName}</p>
          {txRef && <p className="text-xs text-muted-foreground mt-1 font-mono">Ref: {txRef}</p>}
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={() => { setStep("select"); setSelectedCategory(null); setSelectedBillerCode(""); setCustomerReference(""); setAmount(""); setVerifiedName(null); }}>Pay Another</Button>
          <Button onClick={() => navigate("/consumer")}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === "form" ? setStep("select") : step === "verify" ? setStep("form") : navigate("/consumer")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Bill Payments</h1>
      </div>

      <Tabs defaultValue="pay">
        <TabsList className="w-full">
          <TabsTrigger value="pay" className="flex-1">Pay Bill</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pay" className="space-y-4 mt-4">
          {step === "select" && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Select a category</p>
              {catsLoading ? (
                <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {(categories as any[]).map((cat) => {
                    const Icon = ICON_MAP[cat.code] ?? Zap;
                    const color = COLOR_MAP[cat.code] ?? "text-primary";
                    return (
                      <button key={cat.code} onClick={() => { setSelectedCategory(cat.code); setStep("form"); }}
                        className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/50 hover:bg-muted transition-all">
                        <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center shadow-sm">
                          <Icon className={`w-6 h-6 ${color}`} />
                        </div>
                        <span className="text-sm font-medium">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "form" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                {billersLoading ? <Skeleton className="h-10 rounded-lg" /> : (
                  <Select value={selectedBillerCode} onValueChange={(v) => {
                    setSelectedBillerCode(v);
                    setSelectedBillerName((billers as any[]).find(b => b.code === v)?.name ?? v);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>{(billers as any[]).map(b => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{selectedCategory === "electricity" ? "Meter Number" : selectedCategory === "cable" ? "Smart Card / IUC Number" : "Account / Phone Number"}</Label>
                <Input
                  placeholder={selectedCategory === "airtime" || selectedCategory === "data" ? "08012345678" : "Enter account number"}
                  value={customerReference}
                  onChange={e => setCustomerReference(e.target.value.replace(/\s/g, ""))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Amount (NGN)</Label>
                <Input type="number" placeholder="e.g. 5000" min={50} value={amount} onChange={e => setAmount(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  {[500, 1000, 2000, 5000].map(v => (
                    <button key={v} onClick={() => setAmount(String(v))} className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors">
                      &#8358;{v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full" onClick={handleVerify}
                disabled={!selectedBillerCode || !customerReference || !amount || verifyMutation.isPending}>
                {verifyMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying...</> : "Verify & Continue"}
              </Button>
            </div>
          )}

          {step === "verify" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Confirm Payment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {verifiedName && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Verified Account</p>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{verifiedName}</p>
                    </div>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="font-medium">{selectedBillerName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{customerReference}</span></div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-lg font-bold">&#8358;{parseFloat(amount).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>Edit</Button>
                  <Button className="flex-1" onClick={() => setStep("pin")}>Enter PIN</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4"><BillHistory /></TabsContent>
      </Tabs>

      <PinDialog open={step === "pin"} onClose={() => setStep("verify")} onConfirm={handlePay} isPending={payBill.isPending} />
    </div>
  );
}
