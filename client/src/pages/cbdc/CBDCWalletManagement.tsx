// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Wallet, Plus, RefreshCw, Send, Activity, ArrowRightLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";

export default function CBDCWalletManagement() {
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ ownerType: "BUSINESS", currency: "eNGN", rail: "ENAIRA" });
  const [txForm, setTxForm] = useState<Record<string, string>>({ rail: "ENAIRA", currency: "eNGN" });
  const [swapForm, setSwapForm] = useState<Record<string, string>>({ swapType: "CBDC_TO_FIAT", sourceCurrency: "NGN", destCurrency: "NGN" });

  const { data: accounts, refetch, isLoading } = trpc.cbdc.listAccounts.useQuery({ rail: undefined });
  const { data: transfers } = trpc.cbdc.listTransfers.useQuery({ rail: undefined, status: undefined, limit: 50, offset: 0 });
  const { data: stats } = trpc.cbdc.getCBDCStats.useQuery();

  const createAccountMutation = trpc.cbdc.createAccount.useMutation({
    onSuccess: () => { toast.success("CBDC account created."); setCreateOpen(false); setForm({ ownerType: "BUSINESS", currency: "eNGN", rail: "ENAIRA" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const transferKey = useIdempotencyKey();
  const transferMutation = trpc.cbdc.initiateTransfer.useMutation({
    onSuccess: () => { transferKey.reset(); toast.success("CBDC transfer initiated."); setTransferOpen(false); setTxForm({ rail: "ENAIRA", currency: "eNGN" }); refetch(); },
    onError: (e) => { transferKey.reset(); toast.error(e.message); },
  });
  const swapKey = useIdempotencyKey();
  const swapMutation = trpc.cbdc.initiateAtomicSwap.useMutation({
    onSuccess: () => { swapKey.reset(); toast.success("Atomic swap initiated."); setSwapOpen(false); setSwapForm({ swapType: "CBDC_TO_FIAT", sourceCurrency: "NGN", destCurrency: "NGN" }); },
    onError: (e) => { swapKey.reset(); toast.error(e.message); },
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setTx = (k: string, v: string) => setTxForm((p) => ({ ...p, [k]: v }));
  const setSwap = (k: string, v: string) => setSwapForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-purple-500" /> CBDC Account Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage eNaira / CBDC accounts, transfers, and atomic swap operations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setSwapOpen(true)}><ArrowRightLeft className="h-4 w-4 mr-1" /> Atomic Swap</Button>
          <Button variant="outline" onClick={() => setTransferOpen(true)}><Send className="h-4 w-4 mr-1" /> Transfer</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create Account</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{stats.totalAccounts ?? 0}</p><p className="text-xs text-muted-foreground">Total Accounts</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{stats.totalTransfers ?? 0}</p><p className="text-xs text-muted-foreground">Total Transfers</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{stats.settledTransfers ?? 0}</p><p className="text-xs text-muted-foreground">Settled</p></CardContent></Card>
          <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{stats.pendingTransfers ?? 0}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transfers">Transfer History</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet ID</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Owner Type</TableHead>
                    <TableHead>Rail</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
                  {!isLoading && !accounts?.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No CBDC accounts found.</TableCell></TableRow>}
                  {accounts?.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.wallet_id ?? a.walletId ?? a.id}</TableCell>
                      <TableCell className="text-sm">{a.owner_id ?? a.ownerId ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{a.owner_type ?? a.ownerType ?? "—"}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{a.rail}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{a.currency}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{((a.balance ?? 0) / 100).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={a.status === "ACTIVE" ? "default" : "secondary"}>{a.status ?? "ACTIVE"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Rail</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!transfers?.transfers?.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transfer history.</TableCell></TableRow>}
                  {transfers?.transfers?.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">{String(tx.id).slice(0, 12)}…</TableCell>
                      <TableCell><Badge variant="outline">{tx.rail}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{tx.sender_wallet_id ?? tx.senderWalletId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{tx.receiver_wallet_id ?? tx.receiverWalletId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{((Number(tx.amount) ?? 0) / 100).toLocaleString()} {tx.currency}</TableCell>
                      <TableCell><Badge variant={tx.status === "SETTLED" ? "default" : "secondary"}>{tx.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Account Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create CBDC Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Rail <span className="text-destructive">*</span></Label>
              <Select value={form.rail} onValueChange={(v) => set("rail", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ENAIRA">eNaira</SelectItem><SelectItem value="ECB_TIPS">ECB TIPS</SelectItem><SelectItem value="DCEP">DCEP</SelectItem><SelectItem value="FEDNOW">FedNow</SelectItem><SelectItem value="SAND">SAND</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Wallet ID <span className="text-destructive">*</span></Label><Input placeholder="e.g. WALLET-001" value={form.walletId ?? ""} onChange={(e) => set("walletId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Owner ID <span className="text-destructive">*</span></Label><Input placeholder="User or merchant ID" value={form.ownerId ?? ""} onChange={(e) => set("ownerId", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Owner Type</Label>
                <Select value={form.ownerType} onValueChange={(v) => set("ownerType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="BUSINESS">Business</SelectItem><SelectItem value="BANK">Bank</SelectItem><SelectItem value="GOVERNMENT">Government</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="eNGN">eNGN</SelectItem><SelectItem value="eGHS">eGHS</SelectItem><SelectItem value="eKES">eKES</SelectItem><SelectItem value="CNY">CNY (mBridge)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createAccountMutation.mutate({ rail: form.rail, walletId: form.walletId, ownerId: form.ownerId, ownerType: form.ownerType as any, currency: form.currency })} disabled={createAccountMutation.isPending}>
              {createAccountMutation.isPending ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Initiate CBDC Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Rail</Label>
              <Select value={txForm.rail} onValueChange={(v) => setTx("rail", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ENAIRA">eNaira</SelectItem><SelectItem value="ECB_TIPS">ECB TIPS</SelectItem><SelectItem value="DCEP">DCEP</SelectItem><SelectItem value="FEDNOW">FedNow</SelectItem><SelectItem value="SAND">SAND</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>From Wallet ID <span className="text-destructive">*</span></Label><Input placeholder="Sender wallet ID" value={txForm.senderWallet ?? ""} onChange={(e) => setTx("senderWallet", e.target.value)} /></div>
            <div className="space-y-2"><Label>To Wallet ID <span className="text-destructive">*</span></Label><Input placeholder="Receiver wallet ID" value={txForm.receiverWallet ?? ""} onChange={(e) => setTx("receiverWallet", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount (kobo) <span className="text-destructive">*</span></Label><Input type="number" placeholder="e.g. 100000" value={txForm.amount ?? ""} onChange={(e) => setTx("amount", e.target.value)} /></div>
              <div className="space-y-2"><Label>Currency</Label>
                <Select value={txForm.currency} onValueChange={(v) => setTx("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="eNGN">eNGN</SelectItem><SelectItem value="eGHS">eGHS</SelectItem><SelectItem value="eKES">eKES</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Narration</Label><Input placeholder="Transfer narration" value={txForm.narration ?? ""} onChange={(e) => setTx("narration", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={() => transferMutation.mutate({ rail: txForm.rail as any, senderWallet: txForm.senderWallet, receiverWallet: txForm.receiverWallet, amount: Number(txForm.amount), currency: txForm.currency, narration: txForm.narration || undefined, idempotencyKey: transferKey.getKey() })} disabled={transferMutation.isPending || !txForm.senderWallet || !txForm.receiverWallet || !(Number(txForm.amount) > 0)}>
              {transferMutation.isPending ? "Initiating…" : "Initiate Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atomic Swap Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Initiate Atomic Swap</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Swap Type</Label>
              <Select value={swapForm.swapType} onValueChange={(v) => setSwap("swapType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="CBDC_TO_FIAT">CBDC → Fiat</SelectItem><SelectItem value="FIAT_TO_CBDC">Fiat → CBDC</SelectItem><SelectItem value="CBDC_TO_CBDC">CBDC → CBDC</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Source Rail</Label><Input placeholder="e.g. ENAIRA" value={swapForm.sourceRail ?? ""} onChange={(e) => setSwap("sourceRail", e.target.value)} /></div>
            <div className="space-y-2"><Label>Destination Rail</Label><Input placeholder="e.g. ENAIRA" value={swapForm.destRail ?? ""} onChange={(e) => setSwap("destRail", e.target.value)} /></div>
            <div className="space-y-2"><Label>Source Account / Wallet ID</Label><Input placeholder="Source account" value={swapForm.sourceAccountId ?? ""} onChange={(e) => setSwap("sourceAccountId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Destination Account / Wallet ID</Label><Input placeholder="Destination account" value={swapForm.destAccountId ?? ""} onChange={(e) => setSwap("destAccountId", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Source Amount</Label><Input type="number" placeholder="e.g. 1000" value={swapForm.sourceAmount ?? ""} onChange={(e) => setSwap("sourceAmount", e.target.value)} /></div>
              <div className="space-y-2"><Label>Dest Amount</Label><Input type="number" placeholder="e.g. 1000" value={swapForm.destAmount ?? ""} onChange={(e) => setSwap("destAmount", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Source Currency</Label><Input placeholder="NGN" value={swapForm.sourceCurrency ?? ""} onChange={(e) => setSwap("sourceCurrency", e.target.value)} /></div>
              <div className="space-y-2"><Label>Dest Currency</Label><Input placeholder="NGN" value={swapForm.destCurrency ?? ""} onChange={(e) => setSwap("destCurrency", e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">The FX rate is computed by the server; the destination amount must match the server's quote.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button onClick={() => swapMutation.mutate({ swapType: swapForm.swapType as any, sourceRail: swapForm.sourceRail, destRail: swapForm.destRail, sourceAmount: Number(swapForm.sourceAmount), destAmount: Number(swapForm.destAmount), sourceCurrency: swapForm.sourceCurrency || "NGN", destCurrency: swapForm.destCurrency || "NGN", sourceAccountId: swapForm.sourceAccountId, destAccountId: swapForm.destAccountId, idempotency: swapKey.getKey() })} disabled={swapMutation.isPending || !swapForm.sourceRail || !swapForm.destRail || !swapForm.sourceAccountId || !swapForm.destAccountId || !(Number(swapForm.sourceAmount) > 0) || !(Number(swapForm.destAmount) > 0)}>
              {swapMutation.isPending ? "Initiating…" : "Initiate Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
