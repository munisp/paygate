import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  ShoppingCart,
  SplitSquareHorizontal,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

// ─── Shortcut tiles ─────────────────────────────────────────────────────────
const SHORTCUTS = [
  { id: "send", icon: Send, label: "Send Money", color: "bg-blue-500", description: "Transfer to bank or wallet" },
  { id: "request", icon: ArrowDownLeft, label: "Request", color: "bg-emerald-500", description: "Request payment from customer" },
  { id: "split", icon: SplitSquareHorizontal, label: "Split Bill", color: "bg-violet-500", description: "Divide a bill among people" },
  { id: "topup", icon: Wallet, label: "Top Up", color: "bg-amber-500", description: "Add funds to wallet" },
  { id: "airtime", icon: Phone, label: "Airtime", color: "bg-pink-500", description: "Buy airtime or data" },
  { id: "bills", icon: ShoppingCart, label: "Pay Bills", color: "bg-cyan-500", description: "Utilities, subscriptions" },
  { id: "bulk", icon: Users, label: "Bulk Pay", color: "bg-indigo-500", description: "Pay multiple recipients" },
  { id: "link", icon: Link2, label: "Pay Link", color: "bg-orange-500", description: "Create a payment link" },
];

// ─── QR Amount Presets ───────────────────────────────────────────────────────
const AMOUNT_PRESETS = [500, 1000, 2000, 5000, 10000, 20000, 50000];

// ─── Status chip ────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    success: { label: "Success", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
    reversed: { label: "Reversed", className: "bg-gray-100 text-gray-800 border-gray-200" },
  };
  const cfg = map[status?.toLowerCase()] ?? map.pending;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

// ─── QR Panel ───────────────────────────────────────────────────────────────
function QRPanel({ merchant }: { merchant: any }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [qrData, setQrData] = useState<string | null>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  const generateQR = trpc.qrPayments.generate.useMutation({
    onSuccess: (data: any) => {
      setQrData(data.qrData);
      toast.success("QR code generated");
    },
    onError: (err: any) => toast.error("Failed to generate QR", { description: err.message }),
  });

  const handleGenerate = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    generateQR.mutate({
      amount: Math.round(Number(amount) * 100),
      description: description || "Payment",
    });
  };

  const handleDownload = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const link = document.createElement("a");
      link.download = `paygate-qr-${amount}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
    toast.success("QR code downloaded");
  };

  const handleShare = async () => {
    if (!qrData) return;
    if (navigator.share) {
      await navigator.share({ title: "PayGate QR Code", text: `Pay ₦${amount} via PayGate`, url: qrData });
    } else {
      navigator.clipboard.writeText(qrData);
      toast.success("QR link copied to clipboard");
    }
  };

  return (
    <div className="space-y-4">
      {/* Amount input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Amount (₦)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₦</span>
          <Input
            type="number"
            placeholder="0.00"
            className="pl-7 text-lg font-semibold h-12"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {/* Preset amounts */}
        <div className="flex flex-wrap gap-1.5">
          {AMOUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                amount === String(preset)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted hover:bg-muted/80 border-border"
              }`}
              onClick={() => setAmount(String(preset))}
            >
              ₦{preset.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Description (optional)</Label>
        <Input
          placeholder="e.g. Table 5 order"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <Button className="w-full h-11" onClick={handleGenerate} disabled={generateQR.isPending}>
        {generateQR.isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
        ) : (
          <><QrCode className="h-4 w-4 mr-2" />Generate QR Code</>
        )}
      </Button>

      {/* QR display — animated fade+scale in */}
      {qrData && (
        <div
          className="flex flex-col items-center gap-4 pt-2"
          style={{ animation: "qrFadeIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          <style>{`
            @keyframes qrFadeIn {
              from { opacity: 0; transform: scale(0.7); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
          <div className="p-4 bg-white rounded-2xl shadow-lg border-2 border-primary/20 relative">
            <QRCodeSVG
              ref={qrRef as any}
              value={qrData}
              size={200}
              level="H"
              includeMargin={false}
            />
            {/* Scan indicator corners */}
            <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl-sm" />
            <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr-sm" />
            <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl-sm" />
            <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br-sm" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">₦{Number(amount).toLocaleString()}</p>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <p className="text-xs text-muted-foreground mt-1">Scan to pay via PayGate</p>
          </div>
          {/* Copy link button */}
          <Button
            variant="outline"
            className="w-full border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => {
              navigator.clipboard.writeText(qrData);
              toast.success('Payment link copied!', { description: 'Share this link with your customer.' });
            }}
          >
            <ClipboardCopy className="h-4 w-4 mr-2" />
            Copy Payment Link
          </Button>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1.5" />
              Download
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setQrData(null);
              setAmount("");
              setDescription("");
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Generate new
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Payment Link Generator ──────────────────────────────────────────────────
function PaymentLinkPanel() {
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createLink = trpc.paymentLinks.create.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/pay/${data.id}`;
      setGeneratedLink(link);
      toast.success("Payment link created");
    },
    onError: (err) => toast.error("Failed to create link", { description: err.message }),
  });

  const handleCreate = () => {
    if (!title.trim()) { toast.error("Enter a title"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    createLink.mutate({
      title: title.trim(),
      amount: Math.round(Number(amount) * 100),
      currency: "NGN",
    });
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Link Title</Label>
        <Input placeholder="e.g. Invoice #1042" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Amount (₦)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₦</span>
          <Input
            type="number"
            placeholder="0.00"
            className="pl-7"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <Button className="w-full" onClick={handleCreate} disabled={createLink.isPending}>
        {createLink.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
        Create Payment Link
      </Button>
      {generatedLink && (
        <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Your payment link:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background border rounded-lg px-3 py-2 font-mono break-all">
              {generatedLink}
            </code>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(generatedLink, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function QuickPay() {
  const { user } = useAuth();
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"qr" | "link">("qr");

  const { data: txData, isLoading: txLoading } = trpc.transactions.list.useQuery(
    { limit: 8 },
    { staleTime: 30_000 }
  );

  const [overviewFrom] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const { data: dashData } = trpc.dashboard.overview.useQuery({ from: overviewFrom });

  const recentTx = useMemo(() => (txData?.rows ?? []).slice(0, 8), [txData]);

  const handleShortcut = (id: string) => {
    // Route shortcuts to existing pages where implemented
    if (id === "link") { setActiveTab("link"); return; }
    if (id === "send" || id === "bulk") { window.location.href = "/payouts"; return; }
    if (id === "bills") { window.location.href = "/consumer/bills"; return; }
    if (id === "airtime") { window.location.href = "/consumer/bills"; return; }
    // Remaining shortcuts (request, split, topup) show the coming soon dialog
    setActiveShortcut(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quick Pay</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Accept payments instantly via QR code, payment link, or shortcut actions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column — QR / Link generator */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab switcher */}
          <div className="flex rounded-xl border p-1 bg-muted/40 gap-1">
            {[
              { id: "qr", label: "QR Code", icon: QrCode },
              { id: "link", label: "Pay Link", icon: Link2 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab(id as "qr" | "link")}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-5">
              {activeTab === "qr" ? (
                <QRPanel merchant={dashData?.merchant} />
              ) : (
                <PaymentLinkPanel />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — shortcuts + recent transactions */}
        <div className="lg:col-span-3 space-y-5">
          {/* Shortcut tiles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {SHORTCUTS.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <button
                      key={shortcut.id}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/60 transition-colors group"
                      onClick={() => handleShortcut(shortcut.id)}
                    >
                      <div className={`w-12 h-12 rounded-2xl ${shortcut.color} flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-xs font-medium text-center leading-tight">{shortcut.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Wallet summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 opacity-80" />
                  <span className="text-xs opacity-80">Today's Revenue</span>
                </div>
                <p className="text-2xl font-bold">
                  {dashData ? formatNaira(Number(dashData.overview?.transactions?.totalVolume ?? 0)) : "—"}
                </p>
                <p className="text-xs opacity-70 mt-0.5">All channels combined</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownLeft className="h-4 w-4 opacity-80" />
                  <span className="text-xs opacity-80">Transactions</span>
                </div>
                <p className="text-2xl font-bold">{recentTx.length}</p>
                <p className="text-xs opacity-70 mt-0.5">Recent activity</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent transactions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Recent Transactions
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  View all
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {txLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : recentTx.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Generate a QR code to accept your first payment</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentTx.map((tx: any, _idx) => (
                    <div key={tx.id ?? _idx} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        tx.type === "credit" || tx.status === "completed" || tx.status === "success"
                          ? "bg-emerald-100"
                          : "bg-red-100"
                      }`}>
                        {tx.type === "credit" || tx.status === "completed" || tx.status === "success" ? (
                          <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description ?? tx.reference ?? "Payment"}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(tx.createdAt ?? tx.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{formatNaira(tx.amountKobo ?? tx.amount ?? 0)}</p>
                        <StatusChip status={tx.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Shortcut "coming soon" dialog */}
      <Dialog open={!!activeShortcut} onOpenChange={() => setActiveShortcut(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {SHORTCUTS.find((s) => s.id === activeShortcut)?.label ?? "Feature"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center space-y-3">
            {(() => {
              const s = SHORTCUTS.find((s) => s.id === activeShortcut);
              if (!s) return null;
              const Icon = s.icon;
              return (
                <>
                  <div className={`w-16 h-16 rounded-2xl ${s.color} flex items-center justify-center mx-auto`}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                    Coming soon
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    This feature is under development. Use the QR code or payment link for now.
                  </p>
                </>
              );
            })()}
          </div>
          <Button variant="outline" onClick={() => setActiveShortcut(null)}>Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
