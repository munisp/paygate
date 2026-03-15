import { useState } from "react";
import { Search, UserPlus, Download, X, CreditCard, ArrowUpRight, Phone, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-900",
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.customers.list.useQuery(
    { limit, offset: page * limit, search: search || undefined },
    { staleTime: 60_000 }
  );

  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      setAddOpen(false);
      toast.success("Customer added successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.customers.export.fetch();
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} customers`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} total customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-1.5" />{exporting ? "Exporting..." : "Export"}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />Add Customer
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by name or email..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Name", "Email", "Phone", "Risk Level", "Joined", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? Array(8).fill(0).map((_, i) => (
              <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No customers found</td></tr>
            ) : rows.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setSelectedId(c.id)}
              >
                <td className="px-4 py-3 font-medium text-foreground">{c.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK_COLORS[c.riskLevel] ?? "bg-muted text-muted-foreground"}`}>
                    {c.riskLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2">View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(vals) => createCustomer.mutate(vals)}
        loading={createCustomer.isPending}
      />

      {/* Customer Detail Drawer */}
      <CustomerDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function AddCustomerDialog({
  open, onClose, onSubmit, loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { email: string; name: string; phone?: string }) => void;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email, name, phone: phone || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Space Grotesk, sans-serif" }}>Add Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Full Name *</Label>
            <Input id="cust-name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Email Address *</Label>
            <Input id="cust-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-phone">Phone (optional)</Label>
            <Input id="cust-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 801 234 5678" />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading || !name || !email}>
              {loading ? "Adding..." : "Add Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LOYALTY_TIERS = [
  { name: "Platinum", min: 10000, color: "bg-purple-100 text-purple-700" },
  { name: "Gold",     min: 5000,  color: "bg-yellow-100 text-yellow-700" },
  { name: "Silver",  min: 1000,  color: "bg-slate-100 text-slate-700" },
  { name: "Bronze",  min: 0,     color: "bg-orange-100 text-orange-700" },
];

function getLoyaltyTier(points: number) {
  return LOYALTY_TIERS.find(t => points >= t.min) ?? LOYALTY_TIERS[LOYALTY_TIERS.length - 1];
}

function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { data, isLoading } = trpc.customers.get.useQuery(
    { id: customerId! },
    { enabled: !!customerId, staleTime: 30_000 }
  );

  const numericId = customerId ? parseInt(customerId, 10) : null;
  const { data: loyaltyData, isLoading: loyaltyLoading } = trpc.restaurant.getLoyaltyBalance.useQuery(
    { customerId: numericId! },
    { enabled: !!numericId && !isNaN(numericId!), staleTime: 60_000, retry: false }
  );

  const customer = data?.customer;
  const txs = data?.recentTransactions ?? [];
  const loyaltyPoints = loyaltyData?.points_balance ?? null;
  const loyaltyTier = loyaltyPoints !== null ? getLoyaltyTier(loyaltyPoints) : null;

  return (
    <Sheet open={!!customerId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between pr-0 mb-4">
          <SheetTitle style={{ fontFamily: "Space Grotesk, sans-serif" }}>Customer Detail</SheetTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !customer ? (
          <div className="text-center py-12 text-muted-foreground">Customer not found</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                {(customer.name ?? customer.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-lg leading-tight">{customer.name ?? "Unnamed"}</p>
                <p className="text-sm text-muted-foreground truncate">{customer.email}</p>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK_COLORS[customer.riskLevel] ?? "bg-muted text-muted-foreground"}`}>
                  {customer.riskLevel} risk
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{customer.email}</span>
                </div>
                {customer.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{customer.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Joined {new Date(customer.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stats</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total Transactions</p>
                  <p className="font-semibold text-foreground">{customer.totalTransactions.toLocaleString()}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total Spend</p>
                  <p className="font-semibold text-foreground">₦{(customer.totalSpend / 100).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Loyalty Balance Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loyalty</p>
                {loyaltyTier && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${loyaltyTier.color}`}>
                    {loyaltyTier.name}
                  </span>
                )}
              </div>
              {loyaltyLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : loyaltyPoints !== null ? (
                <div className="bg-muted/40 rounded-lg p-3">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Points Balance</p>
                      <p className="text-2xl font-bold text-foreground">{loyaltyPoints.toLocaleString()}</p>
                    </div>
                    {loyaltyData && (
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Earned: {loyaltyData.lifetime_earned.toLocaleString()}</p>
                        <p>Redeemed: {loyaltyData.lifetime_redeemed.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                  {/* Progress bar toward next tier */}
                  {loyaltyTier && (() => {
                    const nextTierIdx = LOYALTY_TIERS.findIndex(t => t.name === loyaltyTier.name) - 1;
                    const nextTier = nextTierIdx >= 0 ? LOYALTY_TIERS[nextTierIdx] : null;
                    if (!nextTier) return <p className="text-xs text-purple-600 font-medium">Max tier reached</p>;
                    const progress = Math.min(100, ((loyaltyPoints - loyaltyTier.min) / (nextTier.min - loyaltyTier.min)) * 100);
                    return (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{loyaltyTier.name}</span>
                          <span>{(nextTier.min - loyaltyPoints).toLocaleString()} pts to {nextTier.name}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                  Loyalty service unavailable
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Recent Transactions {txs.length > 0 && `(${txs.length})`}
              </p>
              {txs.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg">No transactions found</div>
              ) : (
                <div className="space-y-2">
                  {txs.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          tx.status === "completed" ? "bg-emerald-100" : tx.status === "failed" ? "bg-red-100" : "bg-amber-100"
                        }`}>
                          {tx.status === "completed"
                            ? <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                            : tx.status === "failed"
                            ? <X className="w-4 h-4 text-red-600" />
                            : <CreditCard className="w-4 h-4 text-amber-600" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground capitalize">{tx.channel.replace("_", " ")}</p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{tx.currency} {Number(tx.amount).toLocaleString()}</p>
                        <span className={`text-xs capitalize ${
                          tx.status === "completed" ? "text-emerald-600" : tx.status === "failed" ? "text-red-600" : "text-amber-600"
                        }`}>{tx.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
