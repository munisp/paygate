/**
 * PayGate Merchant Portal — POS Terminals Page
 *
 * Nigerian context:
 *   - Models: Soundbox Basic (audio confirmation), POS Lite (card reader),
 *             POS Smart (Android, full POS), USSD Terminal (feature phone)
 *   - Audio language: English, Yoruba, Hausa, Igbo
 *   - Channels: QR, Card (chip/tap), NIP (instant transfer), USSD
 *   - Amounts in NGN
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Smartphone,
  CreditCard,
  Wifi,
  WifiOff,
  Volume2,
  Monitor,
  Banknote,
  Activity,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(kobo / 100);
}

const MODEL_META: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  soundbox_basic: { label: "Soundbox Basic", icon: Volume2, description: "Audio payment confirmation — ideal for market stalls and roadside vendors" },
  pos_lite: { label: "POS Lite", icon: CreditCard, description: "Card reader with receipt printer — for shops and restaurants" },
  pos_smart: { label: "POS Smart", icon: Monitor, description: "Android POS with full billing software — for supermarkets and pharmacies" },
  ussd_terminal: { label: "USSD Terminal", icon: Smartphone, description: "Feature phone terminal — works without internet" },
};

const LANG_LABELS: Record<string, string> = {
  en: "English",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  suspended: "bg-red-100 text-red-700",
};

// ─── Register Terminal Dialog ─────────────────────────────────────────────────

function RegisterTerminalDialog({ onRegistered }: { onRegistered: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    serialNumber: "",
    model: "soundbox_basic",
    label: "",
    location: "",
    audioLanguage: "en",
  });

  const register = trpc.pos.register.useMutation({
    onSuccess: () => {
      toast.success("Terminal registered successfully");
      setOpen(false);
      onRegistered();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Register Terminal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register POS Terminal</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.serialNumber) { toast.error("Serial number is required"); return; }
            register.mutate({
              serialNumber: form.serialNumber,
              model: form.model as any,
              label: form.label || undefined,
              location: form.location || undefined,
              audioLanguage: form.audioLanguage as any,
            });
          }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-1">
            <Label>Serial Number *</Label>
            <Input
              placeholder="e.g. SB-2024-001234"
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Model</Label>
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MODEL_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <div>
                      <div className="font-medium">{v.label}</div>
                      <div className="text-xs text-muted-foreground">{v.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Label (optional)</Label>
              <Input
                placeholder="Counter 1"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                placeholder="Ikeja Branch"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Audio Language</Label>
            <Select value={form.audioLanguage} onValueChange={(v) => setForm({ ...form, audioLanguage: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANG_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={register.isPending}>
              {register.isPending ? "Registering…" : "Register"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Process Payment Dialog ───────────────────────────────────────────────────

function ProcessPaymentDialog({ terminalId, terminalLabel }: { terminalId: string; terminalLabel: string }) {
  const [open, setOpen] = useState(false);
  const [amountNGN, setAmountNGN] = useState("");
  const [channel, setChannel] = useState("qr");

  const process = trpc.pos.processPayment.useMutation({
    onSuccess: (data) => {
      toast.success(`Payment processed — Ref: ${data.transactionId}`);
      setOpen(false);
      setAmountNGN("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Banknote className="w-3.5 h-3.5" />
          Process
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Process Payment — {terminalLabel}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const kobo = Math.round(parseFloat(amountNGN) * 100);
            if (isNaN(kobo) || kobo < 100) { toast.error("Minimum amount is ₦1.00"); return; }
            process.mutate({ terminalId, amountKobo: kobo, channel: channel as any });
          }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-1">
            <Label>Amount (₦)</Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="1500.00"
              value={amountNGN}
              onChange={(e) => setAmountNGN(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qr">QR / NQR</SelectItem>
                <SelectItem value="card">Card (Chip/Tap)</SelectItem>
                <SelectItem value="nip">NIP Transfer</SelectItem>
                <SelectItem value="ussd">USSD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={process.isPending}>
              {process.isPending ? "Processing…" : "Process Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function POSTerminals() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const utils = trpc.useUtils();
  const { data: stats } = trpc.pos.stats.useQuery();
  const { data, isLoading, refetch } = trpc.pos.list.useQuery({
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POS Terminals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Soundbox, card machines, and USSD terminals — Nigerian market
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <RegisterTerminalDialog onRegistered={() => { utils.pos.list.invalidate(); utils.pos.stats.invalidate(); }} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Terminals", value: stats?.totalTerminals ?? 0, icon: Monitor },
          { label: "Active", value: stats?.activeTerminals ?? 0, icon: Activity },
          { label: "Total Volume", value: formatNGN(stats?.totalVolumeKobo ?? 0), icon: Banknote },
          { label: "Transactions", value: (stats?.totalTransactions ?? 0).toLocaleString(), icon: CreditCard },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted text-primary">
                  <s.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} terminal{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Terminal Cards */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading terminals…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Smartphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No terminals registered yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Register your first Soundbox or POS terminal above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((t: any) => {
            const meta = MODEL_META[t.model] ?? MODEL_META.soundbox_basic;
            const Icon = meta.icon;
            const isOnline = t.lastHeartbeatAt &&
              Date.now() - new Date(t.lastHeartbeatAt).getTime() < 5 * 60 * 1000;
            return (
              <Card key={t.id} className="relative">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-muted text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{t.label ?? meta.label}</div>
                        <div className="text-xs text-muted-foreground">{t.serialNumber}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isOnline ? (
                        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] ?? ""}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground mb-3">
                    <div className="flex justify-between">
                      <span>Model</span>
                      <span className="text-foreground">{meta.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location</span>
                      <span className="text-foreground">{t.location ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audio</span>
                      <span className="text-foreground">{LANG_LABELS[t.audioLanguage] ?? t.audioLanguage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume</span>
                      <span className="text-foreground font-mono">{formatNGN(t.totalVolumeKobo ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transactions</span>
                      <span className="text-foreground">{(t.totalTransactions ?? 0).toLocaleString()}</span>
                    </div>
                    {t.lastHeartbeatAt && (
                      <div className="flex justify-between">
                        <span>Last seen</span>
                        <span className="text-foreground">
                          {new Date(t.lastHeartbeatAt).toLocaleTimeString("en-NG")}
                        </span>
                      </div>
                    )}
                  </div>

                  <ProcessPaymentDialog
                    terminalId={t.id}
                    terminalLabel={t.label ?? t.serialNumber}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground py-2">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
