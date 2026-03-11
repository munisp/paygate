import { useState } from "react";
import { CreditCard, Plus, Lock, Unlock, Trash2, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CARDS = [
  { id: "VC-001", last4: "4242", network: "Visa", holder: "Acme Corp Operations", balance: 2500000, currency: "NGN", status: "active", created: "Jan 15, 2026", expiry: "01/29", color: "from-indigo-600 to-indigo-800" },
  { id: "VC-002", last4: "5555", network: "Mastercard", holder: "Marketing Team", balance: 850000, currency: "NGN", status: "active", created: "Feb 3, 2026", expiry: "02/29", color: "from-slate-700 to-slate-900" },
  { id: "VC-003", last4: "1234", network: "Visa", holder: "Travel Expenses", balance: 0, currency: "USD", status: "frozen", created: "Dec 10, 2025", expiry: "12/28", color: "from-gray-500 to-gray-700" },
  { id: "VC-004", last4: "9876", network: "Mastercard", holder: "Software Subscriptions", balance: 125000, currency: "NGN", status: "active", created: "Mar 1, 2026", expiry: "03/29", color: "from-violet-600 to-violet-900" },
];

const TRANSACTIONS = [
  { card: "4242", merchant: "AWS", amount: 45000, currency: "NGN", date: "Mar 11, 2026", status: "success" },
  { card: "5555", merchant: "Meta Ads", amount: 120000, currency: "NGN", date: "Mar 10, 2026", status: "success" },
  { card: "4242", merchant: "Zoom", amount: 8500, currency: "NGN", date: "Mar 9, 2026", status: "success" },
  { card: "9876", merchant: "GitHub", amount: 15000, currency: "NGN", date: "Mar 8, 2026", status: "success" },
  { card: "5555", merchant: "Google Ads", amount: 200000, currency: "NGN", date: "Mar 7, 2026", status: "success" },
];

export default function VirtualCards() {
  const [cards, setCards] = useState(CARDS);
  const [showNumbers, setShowNumbers] = useState<Record<string, boolean>>({});

  const toggleFreeze = (id: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, status: c.status === "frozen" ? "active" : "frozen" } : c));
    const card = cards.find((c) => c.id === id);
    toast.success(`Card ${card?.status === "frozen" ? "unfrozen" : "frozen"} successfully`);
  };

  const copyNumber = (last4: string) => {
    navigator.clipboard.writeText(`**** **** **** ${last4}`);
    toast.success("Card number copied");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Virtual Cards</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your business virtual cards</p>
        </div>
        <Button size="sm" onClick={() => toast.success("New virtual card created!")}>
          <Plus className="w-4 h-4 mr-2" />
          Issue New Card
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Cards", value: cards.length, cls: "text-foreground" },
          { label: "Active", value: cards.filter((c) => c.status === "active").length, cls: "text-emerald-600" },
          { label: "Frozen", value: cards.filter((c) => c.status === "frozen").length, cls: "text-amber-600" },
          { label: "Total Balance", value: "₦3.48M", cls: "text-indigo-600" },
        ].map((s) => (
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {cards.map((card) => (
          <div key={card.id} className="space-y-3">
            {/* Card Visual */}
            <div className={`relative rounded-2xl p-5 bg-gradient-to-br ${card.color} text-white overflow-hidden ${card.status === "frozen" ? "opacity-60" : ""}`} style={{ aspectRatio: "1.586/1" }}>
              {/* Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 right-4 w-24 h-24 rounded-full border-2 border-white" />
                <div className="absolute top-8 right-8 w-16 h-16 rounded-full border-2 border-white" />
              </div>

              {card.status === "frozen" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black/40 rounded-xl px-4 py-2 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span className="text-sm font-semibold">FROZEN</span>
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between mb-6">
                <div className="w-8 h-6 rounded bg-yellow-400/80" />
                <span className="text-xs font-semibold opacity-80">{card.network}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  {showNumbers[card.id] ? (
                    <span className="text-sm font-mono tracking-widest">4111 1111 1111 {card.last4}</span>
                  ) : (
                    <span className="text-sm font-mono tracking-widest">•••• •••• •••• {card.last4}</span>
                  )}
                  <button onClick={() => setShowNumbers((p) => ({ ...p, [card.id]: !p[card.id] }))} className="ml-1 opacity-70 hover:opacity-100">
                    {showNumbers[card.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs opacity-70">{card.holder}</p>
              </div>

              <div className="flex items-end justify-between mt-3">
                <div>
                  <p className="text-xs opacity-60">EXPIRES</p>
                  <p className="text-sm font-mono">{card.expiry}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-60">BALANCE</p>
                  <p className="text-sm font-semibold">{card.currency} {card.balance.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Card Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFreeze(card.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                  card.status === "frozen"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {card.status === "frozen" ? <><Unlock className="w-3.5 h-3.5" />Unfreeze</> : <><Lock className="w-3.5 h-3.5" />Freeze</>}
              </button>
              <button
                onClick={() => copyNumber(card.last4)}
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => toast.error(`Card ${card.id} terminated`)}
                className="p-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Card Transactions */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Recent Card Transactions</h3>
        <div className="space-y-1">
          {TRANSACTIONS.map((txn, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{txn.merchant}</p>
                <p className="text-xs text-muted-foreground">Card ending {txn.card} · {txn.date}</p>
              </div>
              <span className="text-sm font-semibold amount">{txn.currency} {txn.amount.toLocaleString()}</span>
              <span className="status-success inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium">Approved</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
