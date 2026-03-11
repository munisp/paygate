import { useState } from "react";
import { Search, UserPlus, Download, X, CreditCard, ArrowUpRight, ArrowDownRight, Shield, Phone, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  const limit = 20;

  const { data, isLoading } = trpc.customers.list.useQuery(
    { limit, offset: page * limit, search: search || undefined },
    { staleTime: 60_000 }
  );

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
          <Button variant="outline" size="sm" onClick={() => toast.info("Export coming soon")}>
            <Download className="w-4 h-4 mr-1.5" />Export
          </Button>
          <Button size="sm" onClick={() => toast.info("Customer creation coming soon")}>
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

      {/* Customer Detail Drawer */}
      <CustomerDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { data, isLoading } = trpc.customers.get.useQuery(
    { id: customerId! },
    { enabled: !!customerId, staleTime: 30_000 }
  );

  const customer = data?.customer;
  const txs = data?.recentTransactions ?? [];

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
            {/* Identity */}
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

            {/* Contact Info */}
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

            {/* Risk & Metadata */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Risk Profile</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Risk Level</p>
                  <p className="font-semibold text-foreground capitalize">{customer.riskLevel}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Customer ID</p>
                  <p className="font-mono text-xs text-foreground truncate">{customer.id}</p>
                </div>
              </div>
              {!!customer.metadata && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">Metadata</p>
                  <pre className="text-xs text-foreground overflow-auto max-h-24 whitespace-pre-wrap">
                    {JSON.stringify(customer.metadata as Record<string, unknown>, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <Separator />

            {/* Recent Transactions */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Recent Transactions {txs.length > 0 && `(${txs.length})`}
              </p>
              {txs.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                  No transactions found
                </div>
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
