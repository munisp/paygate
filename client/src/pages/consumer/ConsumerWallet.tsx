/**
 * Consumer Wallet Page
 * Consumer-facing wallet: balance, top-up, recent transactions, quick actions.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Wallet, Send, QrCode, ArrowUpRight, ArrowDownLeft,
  Plus, Phone, Bell, Eye, EyeOff, Loader2
} from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  );
}

function TopUpDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"bank_transfer" | "card" | "ussd">("bank_transfer");
  const topUp = trpc.wallet.topUp.useMutation({
    onSuccess: (data) => {
      toast.success(`₦${Number(data.newBalance).toLocaleString()} — wallet topped up successfully`);
      onSuccess();
      onClose();
      setAmount("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Top Up Wallet</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Amount (NGN)</Label>
            <Input
              type="number"
              placeholder="e.g. 5000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "bank_transfer", label: "Bank Transfer" },
                { id: "card", label: "Card" },
                { id: "ussd", label: "USSD" },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setChannel(opt.id)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    channel === opt.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={topUp.isPending}>Cancel</Button>
          <Button
            disabled={!amount || parseFloat(amount) < 100 || topUp.isPending}
            onClick={() => topUp.mutate({ amount: parseFloat(amount), currency: "NGN", channel })}
          >
            {topUp.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Top Up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConsumerWallet() {
  useOnboardingGate();
  const [hideBalance, setHideBalance] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: walletData, isLoading: walletLoading } = trpc.wallet.getWallet.useQuery(
    undefined,
    { staleTime: 30_000 }
  );

  const { data: txData, isLoading: txLoading } = trpc.transactions.list.useQuery(
    { limit: 5, offset: 0 },
    { staleTime: 30_000 }
  );

  const wallet = walletData?.wallet;
  const balance = wallet ? parseFloat(wallet.balance) : 0;
  const recentTxs = txData?.rows ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <p className="text-sm text-muted-foreground">Good morning</p>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            My Wallet
          </h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => toast.info("Notifications will appear here")}>
          <Bell className="w-5 h-5" />
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="bg-primary text-primary-foreground overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <CardContent className="relative pt-6 pb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-primary-foreground/70 text-sm mb-1">Total Balance</p>
              {walletLoading ? (
                <Skeleton className="h-10 w-40 bg-primary-foreground/20" />
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-4xl font-bold">
                    {hideBalance ? "••••••" : `₦${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                  <button onClick={() => setHideBalance(!hideBalance)} className="text-primary-foreground/70 hover:text-primary-foreground">
                    {hideBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </div>
            <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-sm text-primary-foreground/80">
              <ArrowDownLeft className="w-4 h-4 text-emerald-300" />
              <span>Wallet ID: {wallet?.id ? String(wallet.id).slice(0, 8) : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-primary-foreground/80">
              <ArrowUpRight className="w-4 h-4 text-red-300" />
              <span>{wallet?.currency ?? "NGN"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3">
        <QuickAction icon={Send} label="Send" onClick={() => navigate("/consumer/send")} />
        <QuickAction icon={QrCode} label="QR Pay" onClick={() => navigate("/consumer/qr")} />
        <QuickAction icon={Plus} label="Top Up" onClick={() => setTopUpOpen(true)} />
        <QuickAction icon={Phone} label="Bill Pay" onClick={() => navigate("/consumer/bills")} />
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/consumer/history")}>
              See all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {txLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))
          ) : recentTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
          ) : (
            recentTxs.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  tx.status === "completed" ? "bg-emerald-50" : "bg-muted"
                }`}>
                  {tx.status === "completed"
                    ? <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    : <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.description || tx.channel}</p>
                  <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {tx.currency} {Number(tx.amount).toLocaleString()}
                  </p>
                  <Badge variant="outline" className="text-xs capitalize">{tx.status}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <TopUpDialog
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        onSuccess={() => utils.wallet.getWallet.invalidate()}
      />
    </div>
  );
}
