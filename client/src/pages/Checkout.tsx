import { useState } from "react";
import { Copy, ExternalLink, Plus, Palette, Eye, Link2, QrCode, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PAYMENT_LINKS = [
  { id: "PL-001", name: "Product Purchase - Premium Plan", amount: 50000, currency: "NGN", uses: 142, status: "active", url: "pay.paygate.africa/pl/abc123", created: "Mar 1, 2026" },
  { id: "PL-002", name: "Consultation Fee", amount: 25000, currency: "NGN", uses: 38, status: "active", url: "pay.paygate.africa/pl/def456", created: "Feb 20, 2026" },
  { id: "PL-003", name: "Annual Subscription", amount: 120000, currency: "NGN", uses: 67, status: "active", url: "pay.paygate.africa/pl/ghi789", created: "Feb 10, 2026" },
  { id: "PL-004", name: "Event Ticket - Tech Summit", amount: 15000, currency: "NGN", uses: 0, status: "draft", url: "pay.paygate.africa/pl/jkl012", created: "Mar 11, 2026" },
];

const CheckoutPreview = ({ theme }: { theme: { primary: string; bg: string; text: string } }) => {
  const [step, setStep] = useState<"pay" | "card" | "success">("pay");
  const [cardNum, setCardNum] = useState("");

  const formatCard = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-border max-w-sm mx-auto" style={{ background: theme.bg }}>
      {/* Header */}
      <div className="px-6 py-5 text-center border-b border-border/20" style={{ background: theme.primary }}>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
          <span className="text-white font-bold text-sm">AC</span>
        </div>
        <p className="text-white/80 text-xs">Acme Corp</p>
        <p className="text-white text-2xl font-bold mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>₦50,000</p>
        <p className="text-white/60 text-xs mt-0.5">Premium Plan Purchase</p>
      </div>

      <div className="p-5">
        {step === "pay" && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Choose payment method</p>
            {[
              { label: "💳 Card Payment", sub: "Visa, Mastercard, Verve" },
              { label: "🏦 Bank Transfer", sub: "Instant virtual account" },
              { label: "📱 Mobile Money", sub: "M-Pesa, MTN, Airtel" },
              { label: "📞 USSD", sub: "*737# and more" },
            ].map((m) => (
              <button
                key={m.label}
                onClick={() => setStep("card")}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.sub}</p>
                </div>
                <span className="text-muted-foreground">›</span>
              </button>
            ))}
          </div>
        )}

        {step === "card" && (
          <div className="space-y-4">
            <button onClick={() => setStep("pay")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              ← Back
            </button>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Card Number</label>
                <input
                  value={cardNum}
                  onChange={(e) => setCardNum(formatCard(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Expiry</label>
                  <input placeholder="MM/YY" className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">CVV</label>
                  <input placeholder="•••" type="password" maxLength={3} className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                </div>
              </div>
              <button
                onClick={() => setStep("success")}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: theme.primary }}
              >
                Pay ₦50,000
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-4 space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <span className="text-3xl">✓</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Payment Successful!</p>
              <p className="text-sm text-muted-foreground mt-1">₦50,000 paid to Acme Corp</p>
            </div>
            <button onClick={() => setStep("pay")} className="text-xs text-primary hover:underline">
              Make another payment
            </button>
          </div>
        )}
      </div>

      <div className="px-5 pb-4 text-center">
        <p className="text-xs text-muted-foreground">Secured by <span className="font-semibold text-primary">PayGate</span></p>
      </div>
    </div>
  );
};

export default function Checkout() {
  const [theme, setTheme] = useState({ primary: "#4F46E5", bg: "#ffffff", text: "#111827" });
  const [activeTab, setActiveTab] = useState<"links" | "theme" | "embed">("links");

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(`https://${url}`);
    toast.success("Payment link copied!");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Checkout & Payment Links</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create and manage payment links, customize checkout</p>
        </div>
        <Button size="sm" onClick={() => toast.success("New payment link created!")}>
          <Plus className="w-4 h-4 mr-2" />
          Create Payment Link
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(["links", "theme", "embed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-all ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "links" ? "Payment Links" : tab === "theme" ? "Checkout Theme" : "Embed Code"}
          </button>
        ))}
      </div>

      {activeTab === "links" && (
        <div className="space-y-4">
          {PAYMENT_LINKS.map((link) => (
            <div key={link.id} className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{link.name}</p>
                  <Badge variant="secondary" className={`text-xs ${link.status === "active" ? "status-success" : "bg-muted text-muted-foreground border-0"}`}>
                    {link.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono truncate">{link.url}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold amount">{link.currency} {link.amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{link.uses} uses</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => copyLink(link.url)} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => toast.info("Opening link preview")} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button onClick={() => toast.info("QR code generated")} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "theme" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6 space-y-5">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                <Palette className="w-4 h-4 inline mr-2 text-primary" />
                Customize Checkout
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Primary Color</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input type="color" value={theme.primary} onChange={(e) => setTheme((p) => ({ ...p, primary: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                    <input value={theme.primary} onChange={(e) => setTheme((p) => ({ ...p, primary: e.target.value }))} className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Background Color</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input type="color" value={theme.bg} onChange={(e) => setTheme((p) => ({ ...p, bg: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                    <input value={theme.bg} onChange={(e) => setTheme((p) => ({ ...p, bg: e.target.value }))} className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Text Color</label>
                  <div className="flex items-center gap-3 mt-2">
                    <input type="color" value={theme.text} onChange={(e) => setTheme((p) => ({ ...p, text: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                    <input value={theme.text} onChange={(e) => setTheme((p) => ({ ...p, text: e.target.value }))} className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => toast.success("Theme saved and applied!")}>Save Theme</Button>
                <Button variant="outline" onClick={() => setTheme({ primary: "#4F46E5", bg: "#ffffff", text: "#111827" })}>Reset</Button>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
            </div>
            <CheckoutPreview theme={theme} />
          </div>
        </div>
      )}

      {activeTab === "embed" && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Embed Checkout on Your Website</h3>
          <p className="text-sm text-muted-foreground">Add this script to your website to enable inline checkout.</p>
          <div className="bg-muted rounded-xl p-4 font-mono text-sm overflow-x-auto">
            <pre className="text-foreground whitespace-pre-wrap">{`<!-- PayGate Inline Checkout -->
<script src="https://js.paygate.africa/v1/checkout.js"></script>
<script>
  const handler = PayGate.setup({
    key: 'pk_live_xxxxxxxxxxxx',
    email: 'customer@example.com',
    amount: 5000000, // Amount in kobo
    currency: 'NGN',
    ref: 'unique_ref_' + Math.random(),
    onSuccess: function(response) {
      console.log('Payment successful:', response);
    },
    onClose: function() {
      console.log('Checkout closed');
    }
  });
  document.getElementById('pay-btn').onclick = () => handler.openIframe();
</script>
<button id="pay-btn">Pay Now</button>`}</pre>
          </div>
          <Button onClick={() => { navigator.clipboard.writeText("PayGate embed code"); toast.success("Code copied!"); }}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Code
          </Button>
        </div>
      )}
    </div>
  );
}
