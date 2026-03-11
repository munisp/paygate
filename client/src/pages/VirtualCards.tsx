import { useState } from "react";
import { CreditCard, Plus, Lock, Unlock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function CardStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:     "bg-emerald-50 text-emerald-700 border-emerald-200",
    frozen:     "bg-blue-50 text-blue-700 border-blue-200",
    terminated: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.active}`}>{status}</span>;
}

export default function VirtualCards() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ label: "", currency: "USD", spendLimit: "" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.virtualCards.list.useQuery(undefined, { staleTime: 60_000 });
  const createCard = trpc.virtualCards.create.useMutation({
    onSuccess: () => { toast.success("Virtual card created"); setShowCreate(false); setForm({ label: "", currency: "USD", spendLimit: "" }); utils.virtualCards.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateCard = trpc.virtualCards.toggleFreeze.useMutation({
    onSuccess: () => { toast.success("Card updated"); utils.virtualCards.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const cards = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Virtual Cards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{cards.length} cards issued</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Issue Card</Button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">Issue Virtual Card</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
              <input value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Marketing Budget"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                {["USD", "EUR", "GBP", "NGN"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Spend Limit (optional)</label>
              <input type="number" value={form.spendLimit} onChange={(e) => setForm(f => ({ ...f, spendLimit: e.target.value }))} placeholder="No limit"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createCard.mutate({ label: form.label || undefined, currency: form.currency, spendLimit: form.spendLimit ? Number(form.spendLimit) : undefined })}
              disabled={createCard.isPending}>
              {createCard.isPending ? "Issuing..." : "Issue Card"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />) :
        cards.length === 0 ? (
          <div className="col-span-3 bg-card rounded-xl border border-border p-12 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No virtual cards yet</p>
          </div>
        ) : cards.map((card) => (
          <div key={card.id} className={`rounded-xl p-5 text-white relative overflow-hidden ${card.brand === "visa" ? "bg-gradient-to-br from-indigo-600 to-indigo-900" : "bg-gradient-to-br from-orange-500 to-red-700"}`}>
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-xs opacity-70 uppercase tracking-wide">Virtual Card</p>
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
                <p className="text-sm font-mono font-semibold">{card.currency} {Number(card.balance).toLocaleString()}</p>
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              {card.status === "active" && (
                <button onClick={() => updateCard.mutate({ id: card.id })}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors" title="Freeze card">
                  <Lock className="w-3.5 h-3.5" />
                </button>
              )}
              {card.status === "frozen" && (
                <button onClick={() => updateCard.mutate({ id: card.id })}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors" title="Unfreeze card">
                  <Unlock className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
