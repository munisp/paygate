// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Monitor, Wifi, WifiOff, Plus, RefreshCw, Activity,
  CreditCard, RotateCcw, XCircle, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveEvent {
  event_id: string;
  event_type: string;
  terminal_id: string;
  serial_number: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-500/15 text-slate-600 border-slate-200",
  suspended: "bg-red-500/15 text-red-700 border-red-200",
  maintenance: "bg-amber-500/15 text-amber-700 border-amber-200",
};

const TXN_STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-700",
  declined: "bg-red-500/15 text-red-700",
  pending: "bg-amber-500/15 text-amber-700",
  refunded: "bg-blue-500/15 text-blue-700",
  voided: "bg-slate-500/15 text-slate-600",
};

function formatKobo(kobo: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(kobo / 100);
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

// ─── Live Event Feed ──────────────────────────────────────────────────────────

function LiveEventFeed({ merchantId }: { merchantId: string }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/events/terminal/${merchantId}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const evt: LiveEvent = JSON.parse(e.data);
        if (evt.event_type === "connected") return;
        setEvents((prev) => [evt, ...prev].slice(0, 50));
      } catch { /* ignore malformed */ }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [merchantId]);

  const EVENT_ICONS: Record<string, React.ReactNode> = {
    txn_completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    txn_failed: <XCircle className="w-4 h-4 text-red-500" />,
    refunded: <RotateCcw className="w-4 h-4 text-blue-500" />,
    voided: <XCircle className="w-4 h-4 text-slate-400" />,
    heartbeat: <Activity className="w-4 h-4 text-slate-400" />,
    provisioned: <Plus className="w-4 h-4 text-violet-500" />,
    status_changed: <AlertCircle className="w-4 h-4 text-amber-500" />,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Live Event Stream</CardTitle>
          <div className="flex items-center gap-2">
            {connected
              ? <><Wifi className="w-4 h-4 text-emerald-500" /><span className="text-xs text-emerald-600">Connected</span></>
              : <><WifiOff className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Disconnected</span></>
            }
          </div>
        </div>
        <CardDescription className="text-xs">Real-time terminal events via Fluvio</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              Waiting for terminal events…
            </p>
          )}
          {events.map((evt) => (
            <div
              key={evt.event_id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <span className="mt-0.5">{EVENT_ICONS[evt.event_type] ?? <Activity className="w-4 h-4" />}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{evt.event_type.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{timeAgo(evt.timestamp)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Terminal {evt.terminal_id} · {evt.serial_number}
                </p>
                {evt.event_type === "txn_completed" && (
                  <p className="text-[11px] font-medium text-emerald-600">
                    {formatKobo((evt.payload.amount_kobo as number) ?? 0, (evt.payload.currency as string) ?? "NGN")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Provision Dialog ─────────────────────────────────────────────────────────

function ProvisionDialog({ merchantId, onSuccess }: { merchantId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ serialNumber: "", model: "PAX_A920", label: "", location: "" });

  const provision = trpc.terminal.provision.useMutation({
    onSuccess: (data) => {
      toast.success(`Terminal ${data.serialNumber} provisioned`);
      setOpen(false);
      setForm({ serialNumber: "", model: "PAX_A920", label: "", location: "" });
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Terminal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Provision New Terminal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Serial Number *</Label>
            <Input
              placeholder="SN123456789"
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </div>
          <div>
            <Label>Model</Label>
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["PAX_A920", "PAX_A35", "VERIFONE_P400", "INGENICO_MOVE5000", "NEXGO_N86", "SUNMI_P2"].map((m) => (
                  <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Label (optional)</Label>
            <Input
              placeholder="Counter 1"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div>
            <Label>Location (optional)</Label>
            <Input
              placeholder="Lagos Branch"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.serialNumber || provision.isPending}
            onClick={() => provision.mutate({
              merchantId,
              serialNumber: form.serialNumber,
              model: form.model,
              label: form.label || undefined,
              location: form.location || undefined,
            })}
          >
            {provision.isPending ? "Provisioning…" : "Provision Terminal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Terminal Card ────────────────────────────────────────────────────────────

function TerminalCard({
  terminal,
  onRefund,
  onStatusChange,
}: {
  terminal: any;
  onRefund: (t: any) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{terminal.label ?? terminal.serialNumber}</p>
              <p className="text-xs text-muted-foreground">{terminal.model?.replace(/_/g, " ")}</p>
            </div>
          </div>
          <Badge className={`text-[10px] border ${STATUS_COLORS[terminal.status] ?? ""}`}>
            {terminal.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
          <div><span className="font-medium text-foreground">S/N:</span> {terminal.serialNumber}</div>
          <div><span className="font-medium text-foreground">Location:</span> {terminal.location ?? "—"}</div>
          <div><span className="font-medium text-foreground">Last seen:</span> {terminal.lastSeenAt ? timeAgo(terminal.lastSeenAt) : "Never"}</div>
          <div><span className="font-medium text-foreground">Firmware:</span> {terminal.firmwareVersion ?? "—"}</div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onRefund(terminal)}
          >
            <RotateCcw className="w-3 h-3 mr-1" />Refund
          </Button>
          <Select
            value={terminal.status}
            onValueChange={(v) => onStatusChange(terminal.id, v)}
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["active", "inactive", "suspended", "maintenance"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TerminalPage() {
  const { user } = useAuth();
  const merchantId = user?.id ?? "demo_merchant";
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundRef, setRefundRef] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const terminalsQ = trpc.terminal.list.useQuery({ merchantId, pageSize: 50 });
  const statsQ = trpc.terminal.stats.useQuery({ merchantId, days: 30 });
  const txnsQ = trpc.terminal.listTransactions.useQuery(
    { merchantId, terminalId: selectedTerminal ?? undefined, pageSize: 20 },
    { enabled: true }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const updateStatus = trpc.terminal.updateStatus.useMutation({
    onSuccess: () => { terminalsQ.refetch(); toast.success("Status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const refundMut = trpc.terminal.refund.useMutation({
    onSuccess: () => {
      setRefundTarget(null);
      setRefundAmount("");
      setRefundRef("");
      txnsQ.refetch();
      toast.success("Refund initiated");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRefund = useCallback((terminal: any) => {
    setRefundTarget(terminal);
  }, []);

  const terminals = terminalsQ.data?.terminals ?? [];
  const stats = statsQ.data;
  const txns = txnsQ.data?.transactions ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">POS Terminals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and monitor your point-of-sale devices
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => terminalsQ.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </Button>
          <ProvisionDialog merchantId={merchantId} onSuccess={() => terminalsQ.refetch()} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Terminals", value: stats?.activeTerminalCount ?? 0, icon: <Monitor className="w-4 h-4" /> },
          { label: "Transactions (30d)", value: (stats?.totalCount ?? 0).toLocaleString(), icon: <CreditCard className="w-4 h-4" /> },
          { label: "Volume (30d)", value: formatKobo(stats?.totalVolumeKobo ?? 0), icon: <Activity className="w-4 h-4" /> },
          { label: "Avg Ticket", value: formatKobo(stats?.avgTicketKobo ?? 0), icon: <Clock className="w-4 h-4" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {s.icon}
                <span className="text-xs">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: terminals + transactions */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="devices">
            <TabsList>
              <TabsTrigger value="devices">Devices ({terminals.length})</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            <TabsContent value="devices" className="mt-4">
              {terminalsQ.isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : terminals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No terminals provisioned yet.</p>
                  <p className="text-xs mt-1">Click "Add Terminal" to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {terminals.map((t: any) => (
                    <TerminalCard
                      key={t.id}
                      terminal={t}
                      onRefund={handleRefund}
                      onStatusChange={(id, status) => updateStatus.mutate({ id, status: status as any })}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="transactions" className="mt-4">
              <div className="mb-3">
                <Select
                  value={selectedTerminal ?? "all"}
                  onValueChange={(v) => setSelectedTerminal(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="All terminals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All terminals</SelectItem>
                    {terminals.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label ?? t.serialNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : txns.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatKobo(tx.amountKobo, tx.currency)}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{tx.paymentMethod}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${TXN_STATUS_COLORS[tx.status] ?? ""}`}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {tx.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                setRefundTarget({ id: tx.terminalId, txnId: tx.id, amount: tx.amountKobo });
                              }}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />Refund
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: live event feed */}
        <div>
          <LiveEventFeed merchantId={merchantId} />
        </div>
      </div>

      {/* Refund Dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Initiate Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Amount (NGN)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Original Transaction Reference</Label>
              <Input
                placeholder="TTX_..."
                value={refundRef}
                onChange={(e) => setRefundRef(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!refundAmount || !refundRef || refundMut.isPending}
              onClick={() => {
                if (!refundTarget) return;
                refundMut.mutate({
                  terminalId: refundTarget.id ?? refundTarget.txnId,
                  originalTransactionId: refundRef,
                  amountKobo: Math.round(parseFloat(refundAmount) * 100),
                  currency: "NGN",
                });
              }}
            >
              {refundMut.isPending ? "Processing…" : "Confirm Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
