import { useState } from "react";
import { Link2, Plus, Copy, ToggleLeft, ToggleRight, BarChart2, Trash2, Search, QrCode, ExternalLink, TrendingUp, MousePointerClick, DollarSign, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Tab = "links" | "analytics";

export default function PaymentLinks() {
  const [tab, setTab] = useState<Tab>("links");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", description: "", amount: "", currency: "NGN", usageLimit: "", redirectUrl: "" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.paymentLinks.list.useQuery(undefined, { staleTime: 60_000 });
  const { data: analytics, isLoading: analyticsLoading } = trpc.paymentLinks.analytics.useQuery({ id: undefined }, { staleTime: 120_000, enabled: tab === "analytics" });

  const createLink = trpc.paymentLinks.create.useMutation({
    onSuccess: () => {
      toast.success("Payment link created");
      setShowCreate(false);
      setForm({ title: "", description: "", amount: "", currency: "NGN", usageLimit: "", redirectUrl: "" });
      utils.paymentLinks.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleLink = trpc.paymentLinks.toggle.useMutation({
    onSuccess: () => { toast.success("Link updated"); utils.paymentLinks.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const links = (data ?? []).filter((l: any) =>
    !search || l.title?.toLowerCase().includes(search.toLowerCase()) || l.slug?.includes(search.toLowerCase())
  );

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${slug}`);
    toast.success("Link copied to clipboard");
  };

  const openQR = (slug: string) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/pay/${slug}`)}`;
    window.open(url, "_blank");
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "links", label: "My Links", icon: <Link2 className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-6" role="main" aria-label="Payment links management">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Links</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Share links to collect payments without code</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Create Link</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">New Payment Link</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
              <input value={form.title} onChange={(e: any) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Product Purchase"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
              <input value={form.description} onChange={(e: any) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this payment for?"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (leave blank for flexible)</label>
              <input type="number" value={form.amount} onChange={(e: any) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Any amount"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <select value={form.currency} onChange={(e: any) => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                {["NGN","GHS","KES","ZAR","USD","GBP","EUR"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Usage Limit (optional)</label>
              <input type="number" value={form.usageLimit} onChange={(e: any) => setForm(f => ({ ...f, usageLimit: e.target.value }))} placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Redirect URL (optional)</label>
              <input value={form.redirectUrl} onChange={(e: any) => setForm(f => ({ ...f, redirectUrl: e.target.value }))} placeholder="https://..."
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createLink.mutate({ title: form.title, description: form.description || undefined, amount: form.amount ? Number(form.amount) : undefined, currency: form.currency, usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined, redirectUrl: form.redirectUrl || undefined })}
              disabled={!form.title || createLink.isPending}>
              {createLink.isPending ? "Creating..." : "Create Link"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Links Tab */}
      {tab === "links" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
          </div>
          <div className="space-y-3">
            {isLoading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />) :
            links.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <Link2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">{search ? "No links match your search" : "No payment links yet"}</p>
                {!search && <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Create your first link</Button>}
              </div>
            ) : links.map((link: any) => (
              <div key={link.id} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{link.title}</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${link.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {link.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {link.description && <p className="text-xs text-muted-foreground mb-1">{link.description}</p>}
                    <p className="text-xs text-muted-foreground font-mono truncate">{window.location.origin}/pay/{link.slug}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{link.amount ? `${link.currency} ${Number(link.amount).toLocaleString()}` : "Flexible amount"}</span>
                      <span>·</span>
                      <span>{link.usageCount ?? 0}{link.usageLimit ? `/${link.usageLimit}` : ""} uses</span>
                      {link.createdAt && <><span>·</span><span>Created {new Date(link.createdAt).toLocaleDateString()}</span></>}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <button onClick={() => copyLink(link.slug)} title="Copy link" className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => openQR(link.slug)} title="Show QR code" className="p-1.5 rounded hover:bg-muted transition-colors">
                      <QrCode className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <a href={`${window.location.origin}/pay/${link.slug}`} target="_blank" rel="noreferrer" title="Open link" className="p-1.5 rounded hover:bg-muted transition-colors">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                    <button onClick={() => toggleLink.mutate({ id: link.id })} title={link.isActive ? "Deactivate" : "Activate"} className="p-1.5 rounded hover:bg-muted transition-colors">
                      {link.isActive ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Analytics Tab */}
      {tab === "analytics" && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : analytics ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Revenue", value: `₦${(analytics.totalRevenue / 100).toLocaleString()}`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, color: "emerald" },
                  { label: "Total Clicks", value: analytics.totalClicks.toLocaleString(), icon: <MousePointerClick className="w-5 h-5 text-blue-500" />, color: "blue" },
                  { label: "Conversion Rate", value: `${analytics.conversionRate}%`, icon: <Percent className="w-5 h-5 text-violet-500" />, color: "violet" },
                  { label: "Active Links", value: analytics.links.filter((l: any) => l.isActive).length.toString(), icon: <TrendingUp className="w-5 h-5 text-amber-500" />, color: "amber" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      {stat.icon}
                    </div>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-link breakdown */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-semibold text-sm">Link Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Link</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Transactions</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Success</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.links.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No data yet</td></tr>
                      ) : analytics.links.map((l: any) => (
                        <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium">{l.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">/pay/{l.slug}</p>
                          </td>
                          <td className="px-5 py-3 text-right">{l.txCount}</td>
                          <td className="px-5 py-3 text-right font-medium">₦{(l.revenue / 100).toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-emerald-600">{l.successCount}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${l.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                              {l.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <BarChart2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground">No analytics data available yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
