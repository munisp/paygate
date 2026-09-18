/**
 * Consumer Quick Pay
 * Mobile-first PayTM-style payment screen for consumers.
 * Features: QR scan/display, shortcut tiles, amount entry, recent transactions.
 */
import { useState } from "react";
import { QrCode, Send, Phone, Zap, ShoppingCart, Repeat, Users, Copy, Check, ArrowRight, Wallet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const SHORTCUTS = [
  { icon: Send,        label: "Send Money",   color: "bg-blue-500/15 text-blue-400",    action: "/consumer/send" },
  { icon: Phone,       label: "Pay Bills",    color: "bg-green-500/15 text-green-400",  action: "/consumer/bills" },
  { icon: QrCode,      label: "Scan QR",      color: "bg-violet-500/15 text-violet-400", action: "/consumer/qr-scan" },
  { icon: Repeat,      label: "Recurring",    color: "bg-amber-500/15 text-amber-400",  action: "/consumer/recurring" },
  { icon: ShoppingCart,label: "Request $",    color: "bg-pink-500/15 text-pink-400",    action: "/consumer/request-money" },
  { icon: Users,       label: "Split Bill",   color: "bg-teal-500/15 text-teal-400",    action: "/consumer/split-bill" },
  { icon: Zap,         label: "Red Envelope", color: "bg-orange-500/15 text-orange-400",action: "/consumer/red-envelope" },
  { icon: Wallet,      label: "My Wallet",    color: "bg-indigo-500/15 text-indigo-400",action: "/consumer" },
];

const AMOUNTS = [500, 1000, 2000, 5000];

export default function ConsumerQuickPay() {
  useOnboardingGate();
  const [amount, setAmount] = useState("");
  const [qrVisible, setQrVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"pay" | "receive">("pay");

  const {isLoading, data: walletData} = trpc.consumerWallet.getBalance.useQuery({}, { staleTime: 30_000 });
  const { data: txData } = trpc.consumerWallet.history.useQuery({ limit: 5, offset: 0 }, { staleTime: 30_000 });
  const balance = walletData?.balanceKobo ?? 0;
  const transactions = txData?.rows ?? [];

  // Deep link: paygate:// for native app, https:// web fallback
  // Format: paygate://pay?to=<walletId>&amount=<kobo>&currency=NGN
  const walletId = walletData?.walletId ?? '';
  const amountKobo = amount ? Number(amount) : 0;
  const deepLinkUrl = walletId
    ? `paygate://pay?to=${encodeURIComponent(walletId)}&amount=${amountKobo}&currency=NGN&ts=${Date.now()}`
    : `${window.location.origin}/consumer/pay?amount=${amountKobo}&currency=NGN&ts=${Date.now()}`;
  const webFallbackUrl = `${window.location.origin}/consumer/pay?to=${encodeURIComponent(walletId)}&amount=${amountKobo}&currency=NGN`;
  // QR encodes the deep link; copy button gives the web fallback URL for sharing
  const paymentUrl = deepLinkUrl;

  const handleGenerateQR = () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an amount first");
      return;
    }
    setQrVisible(true);
  };

  const handleCopy = () => {
    // Share the web fallback URL (works in any browser/messenger)
    navigator.clipboard.writeText(webFallbackUrl);
    setCopied(true);
    toast.success("Payment link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAmount = (kobo: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-5 pt-12 pb-8">
        <p className="text-violet-200 text-sm mb-1">Quick Pay</p>
        <h1 className="text-3xl font-bold text-white">
          {formatAmount(balance)}
        </h1>
        <p className="text-violet-200 text-xs mt-1">Available balance</p>
      </div>

      {/* Tab Toggle */}
      <div className="px-5 -mt-4">
        <div className="bg-card rounded-2xl border border-border p-1 flex gap-1 shadow-lg">
          <button
            onClick={() => { setTab("pay"); setQrVisible(false); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "pay" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            }`}
          >
            Pay Someone
          </button>
          <button
            onClick={() => setTab("receive")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "receive" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            }`}
          >
            Receive Money
          </button>
        </div>
      </div>

      <div className="px-5 mt-5 space-y-5">
        {tab === "pay" ? (
          <>
            {/* Amount Input */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Enter Amount (₦)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₦</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e: any) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-10 pr-4 py-4 text-3xl font-bold bg-muted rounded-xl border-0 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="flex gap-2 mt-3">
                {AMOUNTS.map((a: any) => (
                  <button
                    key={a}
                    onClick={() => setAmount(String(a * 100))}
                    className="flex-1 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    ₦{a.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Shortcut Tiles */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
              <div className="grid grid-cols-4 gap-3">
                {SHORTCUTS.map((s: any) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (s.action) window.location.href = s.action;
                    }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className={`w-14 h-14 rounded-2xl ${s.color} flex items-center justify-center`}>
                      <s.icon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Transactions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent</p>
                <a href="/consumer/history" className="text-xs text-primary flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              {transactions.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">No recent transactions</p>
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {transactions.slice(0, 5).map((tx: any) => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.status === "completed" ? "bg-green-500/15" : tx.status === "failed" ? "bg-red-500/15" : "bg-amber-500/15"
                      }`}>
                        <Send className={`w-4 h-4 ${
                          tx.status === "completed" ? "text-green-400" : tx.status === "failed" ? "text-red-400" : "text-amber-400"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.customerName ?? "Payment"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-sm font-semibold ${
                        tx.status === "completed" ? "text-green-400" : tx.status === "failed" ? "text-red-400" : "text-amber-400"
                      }`}>
                        {formatAmount(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Receive Tab — QR Code */
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-5">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Request Amount (₦) — optional</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₦</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e: any) => { setAmount(e.target.value); setQrVisible(false); }}
                  placeholder="0"
                  className="w-full pl-10 pr-4 py-4 text-3xl font-bold bg-muted rounded-xl border-0 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleGenerateQR}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors"
            >
              Generate QR Code
            </button>

            {qrVisible && (
              <div
                className="bg-card rounded-2xl border border-border p-6 flex flex-col items-center gap-4"
                style={{ animation: "qrSpring 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
              >
                <style>{`@keyframes qrSpring{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>
                {/* Corner brackets */}
                <div className="relative p-4 bg-white rounded-xl shadow-inner">
                  <div className="absolute top-1 left-1 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl-sm" />
                  <div className="absolute top-1 right-1 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr-sm" />
                  <div className="absolute bottom-1 left-1 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl-sm" />
                  <div className="absolute bottom-1 right-1 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br-sm" />
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(paymentUrl)}&format=png&margin=0`}
                    alt="Payment QR code"
                    width={180}
                    height={180}
                  />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">
                    {amount ? `₦${(Number(amount) / 100).toLocaleString()}` : "Any amount"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Show this QR to receive payment</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Payment Link"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
