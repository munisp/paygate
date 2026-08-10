import { useState } from "react";
import { CreditCard, Plus, Lock, Unlock, TrendingUp, DollarSign, Search, Edit2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function CardStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:     "bg-emerald-100 text-emerald-700 border-emerald-200",
    frozen:     "bg-blue-100 text-blue-700 border-blue-200",
    terminated: "bg-red-100 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.active}`}>{status}</span>;
}

export default function VirtualCards() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [topUpCard, setTopUpCard] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [editLimitCard, setEditLimitCard] = useState<string | null>(null);
  const [editLimitValue, setEditLimitValue] = useState("");
  const [form, setForm] = useState({ label: "", currency: "USD", spendLimit: "", brand: "visa" as "visa" | "mastercard" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.virtualCards.list.useQuery(undefined, { staleTime: 60_000 });
  const createCard = trpc.virtualCards.create.useMutation({
    onSuccess: () => { toast.success("Virtual card issued"); setShowCreate(false); setForm({ label: "", currency: "USD", spendLimit: "", brand: "visa" }); utils.virtualCards.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleFreeze = trpc.virtualCards.toggleFreeze.useMutation({
    onSuccess: () => { toast.success("Card updated"); utils.virtualCards.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const topUp = trpc.virtualCards.topUp.useMutation({
    onSuccess: (res) => { toast.success(`Card topped up — new balance: ${res.newBalance}`); setTopUpCard(null); setTopUpAmount(""); utils.virtualCards.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateSpendLimit = trpc.virtualCards.updateSpendLimit.useMutation({
    onSuccess: () => { toast.success("Spend limit updated"); setEditLimitCard(null); setEditLimitValue(""); utils.virtualCards.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cards = (data ?? []).filter((c: any) =>
    !search || c.label?.toLowerCase().includes(search.toLowerCase()) || c.maskedPan?.includes(search)
  );

  const activeCount = (data ?? []).filter((c: any) => c.status === "active").length;
  const frozenCount = (data ?? []).filter((c: any) => c.status === "frozen").length;
  const totalBalance = (data ?? []).reduce((s: number, c: any) => s + Number(c.balance ?? 0), 0);

  return (
    <div className="p-6 space-y-6" role="main" aria-label="Virtual cards management">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Virtual Cards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(data ?? []).length} cards issued</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Issue Card</Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active", value: activeCount, icon: <CreditCard className="w-4 h-4 text-emerald-500" /> },
          { label: "Frozen", value: frozenCount, icon: <Lock className="w-4 h-4 text-blue-500" /> },
          { label: "Total Balance", value: `$${totalBalance.toLocaleString()}`, icon: <DollarSign className="w-4 h-4 text-violet-500" /> },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            {s.icon}
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">Issue Virtual Card</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label (optional)</label>
              <input value={form.label} onChange={(e: any) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Marketing Budget"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <select value={form.currency} onChange={(e: any) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                {["USD", "EUR", "GBP", "NGN"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Network</label>
              <select value={form.brand} onChange={(e: any) => setForm(f => ({ ...f, brand: e.target.value as "visa" | "mastercard" }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Spend Limit (optional)</label>
              <input type="number" value={form.spendLimit} onChange={(e: any) => setForm(f => ({ ...f, spendLimit: e.target.value }))} placeholder="No limit"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createCard.mutate({ label: form.label || undefined, currency: form.currency, brand: form.brand, spendLimit: form.spendLimit ? Number(form.spendLimit) : undefined })}
              disabled={createCard.isPending}>
              {createCard.isPending ? "Issuing..." : "Issue Card"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by label or card number..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />) :
        cards.length === 0 ? (
          <div className="col-span-3 bg-card rounded-xl border border-border p-12 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">{search ? "No cards match your search" : "No virtual cards yet"}</p>
            {!search && <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Issue your first card</Button>}
          </div>
        ) : cards.map((card: any) => (
          <div key={card.id} className="rounded-xl overflow-hidden border border-border">
            {/* Card face */}
            <div className={`p-5 text-white relative ${card.brand === "visa" ? "bg-gradient-to-br from-indigo-600 to-indigo-900" : "bg-gradient-to-br from-orange-500 to-red-700"}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-xs opacity-70 uppercase tracking-wide">{card.brand?.toUpperCase()} Virtual</p>
                  <p className="font-semibold mt-0.5">{card.label ?? "Unnamed Card"}</p>
                </div>
                <CardStatusBadge status={card.status} />
              </div>
              <p className="font-mono text-lg tracking-widest mb-4">{card.maskedPan}</p>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs opacity-70">Expires</p>
                  <p className="text-sm font-mono">{String(card.expiryMonth).padStart(2, "0")}/{card.expiryYear}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70">Balance</p>
                  <p className="text-sm font-mono font-semibold">{card.currency} {Number(card.balance ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Card actions */}
            <div className="bg-card px-4 py-3 space-y-2">
              {/* Spend limit row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Spend Limit</span>
                {editLimitCard === card.id ? (
                  <div className="flex items-center gap-1">
                    <input type="number" value={editLimitValue} onChange={e => setEditLimitValue(e.target.value)}
                      className="w-20 px-2 py-0.5 text-xs bg-muted rounded border-0 outline-none focus:ring-1 focus:ring-primary" placeholder="Amount" />
                    <button onClick={() => updateSpendLimit.mutate({ id: card.id, spendLimit: editLimitValue ? Number(editLimitValue) : null })}
                      className="p-0.5 rounded hover:bg-muted text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditLimitCard(null)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-foreground">{card.spendLimit ? `${card.currency} ${Number(card.spendLimit).toLocaleString()}` : "No limit"}</span>
                    <button onClick={() => { setEditLimitCard(card.id); setEditLimitValue(card.spendLimit?.toString() ?? ""); }}
                      className="p-0.5 rounded hover:bg-muted"><Edit2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {/* Top-up row */}
              {topUpCard === card.id ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-muted rounded border-0 outline-none focus:ring-1 focus:ring-primary" placeholder="Amount to add" />
                  <button onClick={() => topUp.mutate({ id: card.id, amount: Number(topUpAmount) })}
                    disabled={!topUpAmount || topUp.isPending}
                    className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded font-medium disabled:opacity-50">
                    {topUp.isPending ? "..." : "Add"}
                  </button>
                  <button onClick={() => setTopUpCard(null)} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {card.status === "active" && (
                    <button onClick={() => setTopUpCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors font-medium">
                      <TrendingUp className="w-3.5 h-3.5" />Top Up
                    </button>
                  )}
                  <button onClick={() => toggleFreeze.mutate({ id: card.id })}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors font-medium">
                    {card.status === "frozen" ? <><Unlock className="w-3.5 h-3.5" />Unfreeze</> : <><Lock className="w-3.5 h-3.5" />Freeze</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
