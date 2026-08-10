/**
 * Recurring / Scheduled Payments (Consumer) - Wave 68
 * Create and manage standing orders for bills and P2P transfers.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Plus, Pause, Loader2, Calendar, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 Months",
};

export default function RecurringPayments() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [type, setType] = useState<"bill" | "p2p">("bill");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [billerCode, setBillerCode] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [maxRuns, setMaxRuns] = useState("");

  const utils = trpc.useUtils();
  const { data: activeData, isLoading: activeLoading } = trpc.recurring.list.useQuery({ active: true }, { staleTime: 30_000 });
  const { data: inactiveData } = trpc.recurring.list.useQuery({ active: false }, { staleTime: 60_000 });
  const active = (activeData as any[]) ?? [];
  const inactive = (inactiveData as any[]) ?? [];

  const create = trpc.recurring.create.useMutation({
    onSuccess: () => {
      toast.success("Recurring payment created!");
      setCreateOpen(false);
      resetForm();
      utils.recurring.list.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const cancel = trpc.recurring.cancel.useMutation({
    onSuccess: () => { toast.success("Recurring payment cancelled"); utils.recurring.list.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const resetForm = () => {
    setLabel(""); setAmount(""); setFrequency("monthly");
    setBillerCode(""); setCustomerRef(""); setRecipientAccount("");
    setRecipientBank(""); setRecipientName(""); setMaxRuns("");
  };

  const handleCreate = () => {
    if (!label || !amount) { toast.error("Label and amount are required"); return; }
    create.mutate({
      type,
      label,
      amountKobo: Math.round(parseFloat(amount) * 100),
      frequency,
      maxRuns: maxRuns ? parseInt(maxRuns) : undefined,
      billerCode: type === "bill" ? billerCode : undefined,
      customerReference: type === "bill" ? customerRef : undefined,
      recipientAccountNumber: type === "p2p" ? recipientAccount : undefined,
      recipientBankCode: type === "p2p" ? recipientBank : undefined,
      recipientName: type === "p2p" ? recipientName : undefined,
    });
  };

  const RecurringCard = ({ r }: { r: any }) => (
    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          {r.type === "bill" ? <Zap className="w-5 h-5 text-primary" /> : <RefreshCw className="w-5 h-5 text-primary" />}
        </div>
        <div>
          <p className="text-sm font-medium">{r.label}</p>
          <p className="text-xs text-muted-foreground">
            &#8358;{(r.amountKobo / 100).toLocaleString()} · {FREQUENCY_LABELS[r.frequency] ?? r.frequency}
          </p>
          {r.nextRunAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />Next: {new Date(r.nextRunAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={r.isActive ? "default" : "secondary"} className="text-[10px]">
          {r.isActive ? "Active" : "Cancelled"}
        </Badge>
        {r.isActive && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
            onClick={() => { if (confirm("Cancel this recurring payment?")) cancel.mutate({ id: r.id }); }}>
            <Pause className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-semibold">Recurring Payments</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />New
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">Active {active.length > 0 && `(${active.length})`}</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-3 space-y-2">
          {activeLoading ? (
            [1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : !active.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active recurring payments</p>
            </div>
          ) : active.map((r: any) => <RecurringCard key={r.id} r={r} />)}
        </TabsContent>

        <TabsContent value="history" className="mt-3 space-y-2">
          {!inactive.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No cancelled payments</div>
          ) : inactive.map((r: any) => <RecurringCard key={r.id} r={r} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Recurring Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Payment Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v as "bill" | "p2p")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bill">Bill Payment</SelectItem>
                  <SelectItem value="p2p">Transfer to Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input placeholder="e.g. Monthly DSTV" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (NGN)</Label>
              <Input type="number" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v: any) => setFrequency(v as "daily" | "weekly" | "monthly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Max Runs (optional, blank = unlimited)</Label>
              <Input type="number" placeholder="e.g. 12" value={maxRuns} onChange={e => setMaxRuns(e.target.value)} />
            </div>
            {type === "bill" && (
              <>
                <div className="space-y-1.5">
                  <Label>Biller Code</Label>
                  <Input placeholder="e.g. DSTV" value={billerCode} onChange={e => setBillerCode(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Customer Reference</Label>
                  <Input placeholder="Smart card / meter number" value={customerRef} onChange={e => setCustomerRef(e.target.value)} />
                </div>
              </>
            )}
            {type === "p2p" && (
              <>
                <div className="space-y-1.5">
                  <Label>Recipient Account Number</Label>
                  <Input placeholder="10-digit account number" value={recipientAccount} onChange={e => setRecipientAccount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Code</Label>
                  <Input placeholder="e.g. 058" value={recipientBank} onChange={e => setRecipientBank(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Recipient Name</Label>
                  <Input placeholder="Account name" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
