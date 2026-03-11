import { useState, useEffect, useRef } from "react";
import {
  Link2, Plus, Copy, QrCode, ExternalLink, Trash2, BarChart3,
  Clock, CheckCircle2, XCircle, Eye, EyeOff, Share2, Download,
  ArrowUpRight, Zap, Calendar, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const LINKS = Array.from({ length: 12 }, (_, i) => ({
  id: `pl_${Math.random().toString(36).slice(2, 10)}`,
  name: ["Black Friday Sale", "Course Payment", "Consulting Fee", "Product Launch", "Monthly Subscription", "Event Ticket", "Donation Drive", "Invoice #1042"][i % 8],
  slug: `acme-${["blackfriday", "course-payment", "consulting", "product-launch", "subscription", "event-ticket", "donate", "invoice-1042"][i % 8]}`,
  amount: i % 3 === 0 ? null : Math.floor(Math.random() * 500000) + 5000,
  currency: ["NGN", "KES", "GHS", "USD"][i % 4],
  status: i % 5 === 0 ? "inactive" : "active",
  uses: Math.floor(Math.random() * 200),
  limit: i % 4 === 0 ? Math.floor(Math.random() * 100) + 50 : null,
  revenue: Math.floor(Math.random() * 5000000) + 100000,
  expires: i % 3 === 0 ? new Date(Date.now() + (i + 1) * 86400000 * 7).toLocaleDateString() : null,
  created: new Date(Date.now() - i * 86400000 * 3).toLocaleDateString(),
}));

function QRCodeDisplay({ value, size = 120 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw a simple QR-like pattern using the value as seed
    const cells = 21;
    const cellSize = size / cells;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Deterministic pattern from value hash
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;

    ctx.fillStyle = "#0A0A14";

    // Finder patterns (corners)
    const drawFinder = (x: number, y: number) => {
      ctx.fillRect(x * cellSize, y * cellSize, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = "#0A0A14";
      ctx.fillRect((x + 2) * cellSize, (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
      ctx.fillStyle = "#0A0A14";
    };
    drawFinder(0, 0); drawFinder(14, 0); drawFinder(0, 14);

    // Data cells
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const inFinder = (row < 8 && col < 8) || (row < 8 && col > 12) || (row > 12 && col < 8);
        if (!inFinder) {
          const bit = ((hash ^ (row * 31 + col * 17)) & 1) === 1;
          if (bit) {
            ctx.fillStyle = "#0A0A14";
            ctx.fillRect(col * cellSize, row * cellSize, cellSize - 0.5, cellSize - 0.5);
          }
        }
      }
    }
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg" />;
}

export default function PaymentLinks() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLink, setSelectedLink] = useState<typeof LINKS[0] | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", amount: "", currency: "NGN", description: "",
    collectPhone: true, collectAddress: false, limitUses: false,
    usesLimit: "", expiresAt: "", redirectUrl: "", customSlug: "",
  });

  const baseUrl = "https://pay.paygate.africa/";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error("Please enter a link name"); return; }
    toast.success(`Payment link "${form.name}" created!`);
    setShowCreate(false);
    setForm({ name: "", amount: "", currency: "NGN", description: "", collectPhone: true, collectAddress: false, limitUses: false, usesLimit: "", expiresAt: "", redirectUrl: "", customSlug: "" });
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${baseUrl}${slug}`);
    toast.success("Link copied to clipboard!");
  };

  const filteredLinks = LINKS;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Links</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create shareable links to collect payments — no code required</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />Create Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Links", value: LINKS.filter(l => l.status === "active").length, icon: Link2, cls: "text-primary" },
          { label: "Total Revenue", value: "₦" + (LINKS.reduce((a, l) => a + l.revenue, 0) / 1000000).toFixed(1) + "M", icon: DollarSign, cls: "text-emerald-600" },
          { label: "Total Uses", value: LINKS.reduce((a, l) => a + l.uses, 0).toLocaleString(), icon: BarChart3, cls: "text-indigo-600" },
          { label: "Expiring Soon", value: LINKS.filter(l => l.expires).length, icon: Clock, cls: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold amount ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-5" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Create Payment Link</h3>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Link Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Black Friday Sale" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-medium">Amount (leave blank for customer to enter)</label>
                <div className="flex gap-2 mt-1">
                  <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-20 px-2 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                    {["NGN", "KES", "GHS", "USD", "EUR"].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="flex-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Custom URL Slug</label>
                <div className="flex items-center gap-0 mt-1">
                  <span className="px-3 py-2.5 text-xs text-muted-foreground bg-muted/50 border border-r-0 border-border rounded-l-lg">pay.paygate.africa/</span>
                  <input value={form.customSlug} onChange={e => setForm(p => ({ ...p, customSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="my-product" className="flex-1 px-3 py-2.5 text-sm bg-muted rounded-r-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="What is this payment for?" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium">Redirect URL after payment</label>
                <input value={form.redirectUrl} onChange={e => setForm(p => ({ ...p, redirectUrl: e.target.value }))} placeholder="https://yoursite.com/thank-you" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-medium">Expiry Date</label>
                <input type="date" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Checkout Options</p>
              {[
                { key: "collectPhone", label: "Collect phone number", desc: "Ask customer for phone number" },
                { key: "collectAddress", label: "Collect shipping address", desc: "Ask customer for delivery address" },
                { key: "limitUses", label: "Limit number of uses", desc: "Set maximum number of payments" },
              ].map(opt => (
                <label key={opt.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <div
                    onClick={() => setForm(p => ({ ...p, [opt.key]: !(p as any)[opt.key] }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${(form as any)[opt.key] ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(form as any)[opt.key] ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </label>
              ))}
              {form.limitUses && (
                <input type="number" value={form.usesLimit} onChange={e => setForm(p => ({ ...p, usesLimit: e.target.value }))} placeholder="Maximum number of uses" className="w-full px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
              )}
            </div>

            <div className="flex gap-3">
              <Button type="submit"><Zap className="w-4 h-4 mr-2" />Create Link</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Links Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredLinks.map(link => (
          <div key={link.id} className="bg-card rounded-xl border border-border p-5 space-y-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">{link.name}</p>
                  <Badge className={`text-xs flex-shrink-0 ${link.status === "active" ? "status-success border-0" : "bg-muted text-muted-foreground border-0"}`}>{link.status}</Badge>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{baseUrl}{link.slug}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold amount" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  {link.amount ? `${link.currency} ${link.amount.toLocaleString()}` : <span className="text-muted-foreground text-sm font-normal">Customer enters amount</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{link.uses} uses</p>
                {link.limit && <p className="text-xs text-amber-600">/ {link.limit} max</p>}
              </div>
            </div>

            {link.limit && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((link.uses / link.limit) * 100, 100)}%` }} />
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Revenue: <span className="font-semibold text-foreground amount">₦{(link.revenue / 1000000).toFixed(2)}M</span></span>
              {link.expires && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Expires {link.expires}</span>}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button onClick={() => copyLink(link.slug)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/70 transition-colors text-xs font-medium">
                <Copy className="w-3.5 h-3.5" />Copy
              </button>
              <button onClick={() => setShowQR(showQR === link.id ? null : link.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-medium ${showQR === link.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>
                <QrCode className="w-3.5 h-3.5" />QR Code
              </button>
              <button onClick={() => toast.info(`Sharing ${link.name}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/70 transition-colors text-xs font-medium">
                <Share2 className="w-3.5 h-3.5" />Share
              </button>
              <button onClick={() => toast.error(`${link.name} deleted`)} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {showQR === link.id && (
              <div className="flex flex-col items-center gap-3 pt-3 border-t border-border">
                <QRCodeDisplay value={`${baseUrl}${link.slug}`} size={140} />
                <p className="text-xs text-muted-foreground font-mono">{baseUrl}{link.slug}</p>
                <Button size="sm" variant="outline" onClick={() => toast.success("QR code downloaded!")}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />Download PNG
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
