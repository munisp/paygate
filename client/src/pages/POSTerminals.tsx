/**
 * PayGate Merchant Portal — POS Terminals Page (Wave 30)
 *
 * Nigerian context:
 *   - Models: Soundbox Basic (audio confirmation), POS Lite (card reader),
 *             POS Smart (Android, full POS), USSD Terminal (feature phone)
 *   - Audio language: English, Yoruba, Hausa, Igbo
 *   - Channels: QR, Card (chip/tap/ISO 8583), NIP (instant transfer), USSD
 *   - Real-time feed: Fluvio WebSocket stream (ws://<bridge>/api/ws/pos)
 *   - Soundbox: Web Audio API tones + multilingual confirmation overlay
 *   - Amounts in NGN
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSoundbox, type SoundboxLanguage, type SoundboxEventType } from "@/hooks/useSoundbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  VolumeX,
  Monitor,
  Banknote,
  Activity,
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(kobo / 100);
}

function timeAgo(ts: string | Date | null) {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString("en-NG");
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

// ─── Fluvio Live Feed Hook ────────────────────────────────────────────────────

interface LiveEvent {
  id: string;
  terminalId: string;
  terminalLabel: string;
  eventType: "payment" | "heartbeat" | "card_auth" | "error";
  amountKobo?: number;
  channel?: string;
  status?: string;
  message?: string;
  ts: number;
}

function useFluvioFeed(merchantId: string | undefined) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!merchantId) return;
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws/pos?merchantId=${merchantId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (msg) => {
      try {
        const event: LiveEvent = JSON.parse(msg.data);
        event.id = `${event.terminalId}-${event.ts}-${Math.random()}`;
        setEvents(prev => [event, ...prev].slice(0, 50));
      } catch {
        // ignore malformed frames
      }
    };
  }, [merchantId]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { events, connected };
}

// ─── Soundbox Confirmation Overlay ───────────────────────────────────────────

const CONFIRMATION_BG: Record<string, string> = {
  payment: "bg-emerald-600",
  error: "bg-red-600",
  heartbeat: "bg-blue-600",
  card_auth: "bg-purple-600",
};

type SoundboxConfirmation = ReturnType<typeof useSoundbox>["confirmation"];

function SoundboxOverlay({ confirmation }: { confirmation: SoundboxConfirmation }) {
  if (!confirmation) return null;
  const bg = CONFIRMATION_BG[confirmation.eventType] ?? "bg-slate-700";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 ${bg} text-white rounded-2xl shadow-2xl px-6 py-4 flex flex-col items-center gap-1 min-w-[200px] animate-in slide-in-from-bottom-4 fade-in duration-300`}
    >
      <div className="text-2xl font-bold">
        {confirmation.eventType === "payment" ? "✓" : confirmation.eventType === "error" ? "✗" : "●"}
      </div>
      <div className="text-base font-semibold text-center">{confirmation.message}</div>
      {confirmation.amountNGN && (
        <div className="text-xl font-mono font-bold">{confirmation.amountNGN}</div>
      )}
      {confirmation.terminalLabel && (
        <div className="text-xs opacity-80">{confirmation.terminalLabel}</div>
      )}
    </div>
  );
}

// ─── Register Terminal Dialog ─────────────────────────────────────────────────

function RegisterTerminalDialog({ onRegistered }: { onRegistered: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    serialNumber: string;
    model: "soundbox_basic" | "pos_lite" | "pos_smart" | "ussd_terminal";
    label: string;
    location: string;
    audioLanguage: "en" | "yo" | "ha" | "ig";
  }>({
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
          className="space-y-4"
          onSubmit={(e: any) => {
            e.preventDefault();
            register.mutate(form);
          }}
        >
          <div className="space-y-1">
            <Label>Serial Number</Label>
            <Input
              required
              placeholder="TID-001"
              value={form.serialNumber}
              onChange={(e: any) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Model</Label>
            <Select value={form.model} onValueChange={(v: any) => setForm({ ...form, model: v as "soundbox_basic" | "pos_lite" | "pos_smart" | "ussd_terminal" })}>
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
                onChange={(e: any) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                placeholder="Ikeja Branch"
                value={form.location}
                onChange={(e: any) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Audio Language</Label>
              <Select value={form.audioLanguage} onValueChange={(v: any) => setForm({ ...form, audioLanguage: v as "en" | "yo" | "ha" | "ig" })}>
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
  const [channel, setChannel] = useState<"qr" | "card" | "nip" | "ussd">("qr");

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
          className="space-y-4"
          onSubmit={(e: any) => {
            e.preventDefault();
            const kobo = Math.round(parseFloat(amountNGN) * 100);
            if (isNaN(kobo) || kobo <= 0) {
              toast.error("Enter a valid amount");
              return;
            }
            process.mutate({ terminalId, amountKobo: kobo, channel });
          }}
        >
          <div className="space-y-1">
            <Label>Amount (₦)</Label>
            <Input
              required
              type="number"
              min="1"
              step="0.01"
              placeholder="5000"
              value={amountNGN}
              onChange={(e: any) => setAmountNGN(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v: any) => setChannel(v as "qr" | "card" | "nip" | "ussd")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qr">QR Code</SelectItem>
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

// ─── Live Feed Panel ──────────────────────────────────────────────────────────

function LiveFeedPanel({
  events,
  connected,
  muted,
  onToggleMute,
}: {
  events: LiveEvent[];
  connected: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const EVENT_ICONS: Record<string, React.ElementType> = {
    payment: CheckCircle2,
    heartbeat: Activity,
    card_auth: CreditCard,
    error: XCircle,
  };
  const EVENT_COLORS: Record<string, string> = {
    payment: "text-emerald-600",
    heartbeat: "text-blue-500",
    card_auth: "text-purple-600",
    error: "text-red-500",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Radio className={`w-4 h-4 ${connected ? "text-emerald-500 animate-pulse" : "text-slate-400"}`} />
          Live Fluvio Feed
          <Badge variant={connected ? "default" : "secondary"} className="text-xs">
            {connected ? "Connected" : "Reconnecting…"}
          </Badge>
          <button
            onClick={onToggleMute}
            title={muted ? "Unmute Soundbox" : "Mute Soundbox"}
            className="ml-auto p-1 rounded hover:bg-muted transition-colors"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-600" />
            )}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Zap className="w-6 h-6 mx-auto mb-2 opacity-40" />
            Waiting for terminal events…
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {events.map((ev) => {
              const Icon = EVENT_ICONS[ev.eventType] ?? Activity;
              const color = EVENT_COLORS[ev.eventType] ?? "text-muted-foreground";
              return (
                <div key={ev.id} className="flex items-start gap-2 text-xs border-b pb-2 last:border-0">
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{ev.terminalLabel}</span>
                    {" — "}
                    <span className="capitalize">{ev.eventType.replace("_", " ")}</span>
                    {ev.amountKobo && (
                      <span className="font-mono ml-1 text-emerald-700">
                        {formatNGN(ev.amountKobo)}
                      </span>
                    )}
                    {ev.channel && (
                      <Badge variant="outline" className="ml-1 text-xs py-0 h-4">
                        {ev.channel.toUpperCase()}
                      </Badge>
                    )}
                    {ev.message && (
                      <span className="text-muted-foreground ml-1">{ev.message}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground flex-shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(new Date(ev.ts))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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

  // Soundbox audio simulation (Web Audio API)
  const { play: soundboxPlay, muted, toggleMute, confirmation } = useSoundbox("en");

  // Fluvio real-time feed
  const { events: liveEvents, connected: wsConnected } = useFluvioFeed("current");

  // Fire Soundbox on new events and auto-refresh on payments
  const prevEventKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (liveEvents.length === 0) return;
    const latest = liveEvents[0];
    const eventKey = `${latest.terminalId}-${latest.ts}`;
    if (eventKey === prevEventKeyRef.current) return;
    prevEventKeyRef.current = eventKey;

    // Use the terminal's configured audio language
    const terminal = rows.find((t: any) => t.id === latest.terminalId);
    const lang = (terminal?.audioLanguage as SoundboxLanguage) ?? "en";

    soundboxPlay(latest.eventType as SoundboxEventType, {
      language: lang,
      amountKobo: latest.amountKobo,
      terminalLabel: latest.terminalLabel,
    });

    if (latest.eventType === "payment") {
      utils.pos.list.invalidate();
      utils.pos.stats.invalidate();
    }
  }, [liveEvents, rows, soundboxPlay, utils]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POS Terminals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Soundbox, card machines, and USSD terminals — Nigerian market · Real-time via Fluvio
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
        ].map((s: any) => (
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

      {/* Live Feed + Terminal Health Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <LiveFeedPanel
            events={liveEvents}
            connected={wsConnected}
            muted={muted}
            onToggleMute={toggleMute}
          />
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                Terminal Health Monitor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center text-muted-foreground py-4 text-sm">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-sm">No terminals registered</div>
              ) : (
                <div className="space-y-2">
                  {rows.map((t: any) => {
                    const meta = MODEL_META[t.model] ?? MODEL_META.soundbox_basic;
                    const lastSeen = t.lastHeartbeatAt ? new Date(t.lastHeartbeatAt).getTime() : 0;
                    const msSince = Date.now() - lastSeen;
                    const isOnline = lastSeen > 0 && msSince < 5 * 60_000;
                    const isStale = lastSeen > 0 && msSince >= 5 * 60_000 && msSince < 30 * 60_000;
                    const healthColor = isOnline ? "bg-emerald-500" : isStale ? "bg-amber-400" : "bg-slate-300";
                    return (
                      <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${healthColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{t.label ?? meta.label}</span>
                            <Badge variant="outline" className="text-xs py-0 h-4">{meta.label}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{t.serialNumber} · {t.location ?? "No location"}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-mono text-foreground">{formatNGN(t.totalVolumeKobo ?? 0)}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            {isOnline ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-slate-400" />}
                            {timeAgo(t.lastHeartbeatAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter || "all"} onValueChange={(v: any) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
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
                        <span className="text-foreground">{timeAgo(t.lastHeartbeatAt)}</span>
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

      {/* Soundbox confirmation overlay — bottom-right, auto-dismisses after 3.5s */}
      <SoundboxOverlay confirmation={confirmation} />
    </div>
  );
}
