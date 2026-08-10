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

export default function CBDCWalletManagement() {
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ ownerType: "BUSINESS", currency: "eNGN", rail: "eNaira" });
  const [txForm, setTxForm] = useState<Record<string, string>>({ rail: "eNaira", currency: "eNGN" });
  const [swapForm, setSwapForm] = useState<Record<string, string>>({});

  const { data: accounts, refetch, isLoading } = trpc.cbdc.listAccounts.useQuery({ rail: undefined });
  const { data: transfers } = trpc.cbdc.listTransfers.useQuery({ rail: undefined, status: undefined, limit: 50, offset: 0 });
  const { data: stats } = trpc.cbdc.getCBDCStats.useQuery();

  const createAccountMutation = trpc.cbdc.createAccount.useMutation({
    onSuccess: () => { toast.success("CBDC account created."); setCreateOpen(false); setForm({ ownerType: "BUSINESS", currency: "eNGN", rail: "eNaira" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const transferMutation = trpc.cbdc.initiateTransfer.useMutation({
    onSuccess: () => { toast.success("CBDC transfer initiated."); setTransferOpen(false); setTxForm({ rail: "eNaira", currency: "eNGN" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const swapMutation = trpc.cbdc.initiateAtomicSwap.useMutation({
    onSuccess: () => { toast.success("Atomic swap initiated."); setSwapOpen(false); setSwapForm({}); },
    onError: (e) => toast.error(e.message),
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
                <SelectContent><SelectItem value="eNaira">eNaira</SelectItem><SelectItem value="BRICS">BRICS Bridge</SelectItem><SelectItem value="mBridge">mBridge</SelectItem></SelectContent>
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
                <SelectContent><SelectItem value="eNaira">eNaira</SelectItem><SelectItem value="BRICS">BRICS Bridge</SelectItem><SelectItem value="mBridge">mBridge</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>From Wallet ID <span className="text-destructive">*</span></Label><Input placeholder="Sender wallet ID" value={txForm.senderWalletId ?? ""} onChange={(e) => setTx("senderWalletId", e.target.value)} /></div>
            <div className="space-y-2"><Label>To Wallet ID <span className="text-destructive">*</span></Label><Input placeholder="Receiver wallet ID" value={txForm.receiverWalletId ?? ""} onChange={(e) => setTx("receiverWalletId", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount (kobo) <span className="text-destructive">*</span></Label><Input type="number" placeholder="e.g. 100000" value={txForm.amount ?? ""} onChange={(e) => setTx("amount", e.target.value)} /></div>
              <div className="space-y-2"><Label>Currency</Label>
                <Select value={txForm.currency} onValueChange={(v) => setTx("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="eNGN">eNGN</SelectItem><SelectItem value="eGHS">eGHS</SelectItem><SelectItem value="eKES">eKES</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Reference</Label><Input placeholder="Transfer reference" value={txForm.reference ?? ""} onChange={(e) => setTx("reference", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={() => transferMutation.mutate({ rail: txForm.rail, senderWalletId: txForm.senderWalletId, receiverWalletId: txForm.receiverWalletId, amount: parseInt(txForm.amount), currency: txForm.currency, reference: txForm.reference })} disabled={transferMutation.isPending}>
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
            <div className="space-y-2"><Label>Source Rail</Label><Input placeholder="e.g. eNaira" value={swapForm.sourceRail ?? ""} onChange={(e) => setSwap("sourceRail", e.target.value)} /></div>
            <div className="space-y-2"><Label>Target Rail</Label><Input placeholder="e.g. BRICS" value={swapForm.targetRail ?? ""} onChange={(e) => setSwap("targetRail", e.target.value)} /></div>
            <div className="space-y-2"><Label>Source Wallet ID</Label><Input placeholder="Source wallet" value={swapForm.sourceWalletId ?? ""} onChange={(e) => setSwap("sourceWalletId", e.target.value)} /></div>
            <div className="space-y-2"><Label>Target Wallet ID</Label><Input placeholder="Target wallet" value={swapForm.targetWalletId ?? ""} onChange={(e) => setSwap("targetWalletId", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount (kobo)</Label><Input type="number" placeholder="e.g. 100000" value={swapForm.amount ?? ""} onChange={(e) => setSwap("amount", e.target.value)} /></div>
              <div className="space-y-2"><Label>FX Rate</Label><Input type="number" step="0.0001" placeholder="e.g. 1.0" value={swapForm.fxRate ?? ""} onChange={(e) => setSwap("fxRate", e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button onClick={() => swapMutation.mutate({ sourceRail: swapForm.sourceRail, targetRail: swapForm.targetRail, sourceWalletId: swapForm.sourceWalletId, targetWalletId: swapForm.targetWalletId, amount: parseInt(swapForm.amount), fxRate: parseFloat(swapForm.fxRate) })} disabled={swapMutation.isPending}>
              {swapMutation.isPending ? "Initiating…" : "Initiate Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
