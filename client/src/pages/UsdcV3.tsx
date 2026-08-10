import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Bitcoin, Plus, ArrowUpRight, ArrowDownLeft, Wallet, Loader2 } from "lucide-react";

export default function UsdcV3() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [depositOpen, setDepositOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", network: "ethereum", walletAddress: "" });
  const [payoutForm, setPayoutForm] = useState({ amount: "", network: "ethereum", destinationAddress: "" });
  const [walletForm, setWalletForm] = useState({ network: "ethereum", label: "" });

  const { data: depositsData, isLoading: depositsLoading } = trpc.usdcV3.listDeposits.useQuery({ page: 1 }, { staleTime: 30_000 });
  const { data: payoutsData, isLoading: payoutsLoading } = trpc.usdcV3.listPayouts.useQuery({ page: 1 }, { staleTime: 30_000 });
  const { data: walletsData, isLoading: walletsLoading } = trpc.usdcV3.listV2Wallets.useQuery({ page: 1 }, { staleTime: 30_000 });
  const { data: txData } = trpc.usdcV3.listV2Transactions.useQuery({ page: 1 }, { staleTime: 30_000 });

  const createDeposit = trpc.usdcV3.createDeposit.useMutation({
    onSuccess: () => { utils.usdcV3.listDeposits.invalidate(); setDepositOpen(false); toast({ title: "Deposit initiated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createPayout = trpc.usdcV3.createPayout.useMutation({
    onSuccess: () => { utils.usdcV3.listPayouts.invalidate(); setPayoutOpen(false); toast({ title: "Payout initiated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createWallet = trpc.usdcV3.createV2Wallet.useMutation({
    onSuccess: () => { utils.usdcV3.listV2Wallets.invalidate(); setWalletOpen(false); toast({ title: "Wallet created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deposits = depositsData?.deposits ?? [];
  const payouts = payoutsData?.payouts ?? [];
  const wallets = walletsData?.wallets ?? [];
  const transactions = txData?.transactions ?? [];

  const totalDeposited = deposits.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
  const totalPaidOut = payouts.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bitcoin className="w-6 h-6" /> USDC V3</h1>
          <p className="text-muted-foreground text-sm mt-1">Multi-network USDC deposits, payouts, and wallet management</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild><Button variant="outline"><ArrowDownLeft className="w-4 h-4 mr-2" />Deposit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create USDC Deposit</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Amount (USDC)</Label><Input type="number" value={depositForm.amount} onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} placeholder="1000" /></div>
                <div><Label>Network</Label><Input value={depositForm.network} onChange={e => setDepositForm(f => ({ ...f, network: e.target.value }))} placeholder="ethereum" /></div>
                <div><Label>Wallet Address</Label><Input value={depositForm.walletAddress} onChange={e => setDepositForm(f => ({ ...f, walletAddress: e.target.value }))} placeholder="0x..." /></div>
                <Button className="w-full" disabled={createDeposit.isPending} onClick={() => createDeposit.mutate({ walletAddress: depositForm.walletAddress, amountUsdc: Number(depositForm.amount), network: depositForm.network as any })}>
                  {createDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create Deposit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
            <DialogTrigger asChild><Button><ArrowUpRight className="w-4 h-4 mr-2" />Payout</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Initiate USDC Payout</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Amount (USDC)</Label><Input type="number" value={payoutForm.amount} onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))} placeholder="500" /></div>
                <div><Label>Network</Label><Input value={payoutForm.network} onChange={e => setPayoutForm(f => ({ ...f, network: e.target.value }))} placeholder="ethereum" /></div>
                <div><Label>Destination Address</Label><Input value={payoutForm.destinationAddress} onChange={e => setPayoutForm(f => ({ ...f, destinationAddress: e.target.value }))} placeholder="0x..." /></div>
                <Button className="w-full" disabled={createPayout.isPending} onClick={() => createPayout.mutate({ destinationAddress: payoutForm.destinationAddress, amountUsdc: Number(payoutForm.amount), network: payoutForm.network as any })}>
                  {createPayout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Send Payout
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Deposited</p><p className="text-2xl font-bold">${totalDeposited.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Paid Out</p><p className="text-2xl font-bold">${totalPaidOut.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Wallets</p><p className="text-2xl font-bold">{walletsData?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Transactions</p><p className="text-2xl font-bold">{txData?.total ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="deposits">
        <TabsList>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="deposits" className="space-y-2 mt-4">
          {depositsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div> :
            deposits.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No deposits yet</CardContent></Card> :
            deposits.map((d: any) => (
              <Card key={d.id}><CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">${Number(d.amount ?? 0).toLocaleString()} USDC</p>
                  <p className="text-xs text-muted-foreground">{d.network} · {d.walletAddress?.slice(0, 12)}...</p>
                </div>
                <Badge variant={d.status === "confirmed" ? "default" : "secondary"}>{d.status}</Badge>
              </CardContent></Card>
            ))
          }
        </TabsContent>

        <TabsContent value="payouts" className="space-y-2 mt-4">
          {payoutsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div> :
            payouts.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No payouts yet</CardContent></Card> :
            payouts.map((p: any) => (
              <Card key={p.id}><CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">${Number(p.amount ?? 0).toLocaleString()} USDC</p>
                  <p className="text-xs text-muted-foreground">{p.network} · {p.destinationAddress?.slice(0, 12)}...</p>
                </div>
                <Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status}</Badge>
              </CardContent></Card>
            ))
          }
        </TabsContent>

        <TabsContent value="wallets" className="space-y-2 mt-4">
          <div className="flex justify-end mb-2">
            <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />New Wallet</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create V2 Wallet</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div><Label>Network</Label><Input value={walletForm.network} onChange={e => setWalletForm(f => ({ ...f, network: e.target.value }))} placeholder="ethereum" /></div>
                  <div><Label>Label</Label><Input value={walletForm.label} onChange={e => setWalletForm(f => ({ ...f, label: e.target.value }))} placeholder="Main wallet" /></div>
                  <Button className="w-full" disabled={createWallet.isPending} onClick={() => createWallet.mutate({ label: walletForm.label, network: walletForm.network as any, walletAddress: "" })}>
                    {createWallet.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create Wallet
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {walletsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div> :
            wallets.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No wallets yet</CardContent></Card> :
            wallets.map((w: any) => (
              <Card key={w.id}><CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{w.label ?? w.address?.slice(0, 16)}...</p>
                    <p className="text-xs text-muted-foreground">{w.network} · Balance: ${Number(w.balance ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <Badge variant="outline">{w.status ?? "active"}</Badge>
              </CardContent></Card>
            ))
          }
        </TabsContent>

        <TabsContent value="transactions" className="space-y-2 mt-4">
          {transactions.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No transactions yet</CardContent></Card> :
            transactions.map((t: any) => (
              <Card key={t.id}><CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.type} · ${Number(t.amount ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{t.txHash?.slice(0, 16)}... · {new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge variant={t.status === "confirmed" ? "default" : "secondary"}>{t.status}</Badge>
              </CardContent></Card>
            ))
          }
        </TabsContent>
      </Tabs>
    </div>
  );
}
