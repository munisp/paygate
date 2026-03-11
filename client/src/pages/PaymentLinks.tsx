import { useState } from "react";
import { Link2, Plus, Copy, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function PaymentLinks() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "", currency: "NGN", usageLimit: "", redirectUrl: "" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.paymentLinks.list.useQuery(undefined, { staleTime: 60_000 });
  const createLink = trpc.paymentLinks.create.useMutation({
    onSuccess: () => { toast.success("Payment link created"); setShowCreate(false); setForm({ title: "", description: "", amount: "", currency: "NGN", usageLimit: "", redirectUrl: "" }); utils.paymentLinks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleLink = trpc.paymentLinks.toggle.useMutation({
    onSuccess: () => { toast.success("Link updated"); utils.paymentLinks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const links = data ?? [];
  const copyLink = (slug: string) => { navigator.clipboard.writeText(`${window.location.origin}/pay/${slug}`); toast.success("Link copied"); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Links</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Share links to collect payments without code</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Create Link</Button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">New Payment Link</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Product Purchase"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (leave blank for flexible)</label>
              <input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Any amount"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                {["NGN","GHS","KES","ZAR","USD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Usage Limit (optional)</label>
              <input type="number" value={form.usageLimit} onChange={(e) => setForm(f => ({ ...f, usageLimit: e.target.value }))} placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Redirect URL (optional)</label>
              <input value={form.redirectUrl} onChange={(e) => setForm(f => ({ ...f, redirectUrl: e.target.value }))} placeholder="https://..."
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createLink.mutate({ title: form.title, amount: form.amount ? Number(form.amount) : undefined, currency: form.currency, usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined, redirectUrl: form.redirectUrl || undefined })}
              disabled={!form.title || createLink.isPending}>
              {createLink.isPending ? "Creating..." : "Create Link"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />) :
        links.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Link2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No payment links yet</p>
          </div>
        ) : links.map((link) => (
          <div key={link.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">{link.title}</p>
                  {!link.isActive && <span className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">Inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{window.location.origin}/pay/{link.slug}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{link.amount ? `${link.currency} ${Number(link.amount).toLocaleString()}` : "Flexible amount"}</span>
                  <span>·</span>
                  <span>{link.usageCount}{link.usageLimit ? `/${link.usageLimit}` : ""} uses</span>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => copyLink(link.slug)} className="p-1.5 rounded hover:bg-muted transition-colors">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => toggleLink.mutate({ id: link.id })} className="p-1.5 rounded hover:bg-muted transition-colors">
                  {link.isActive ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
