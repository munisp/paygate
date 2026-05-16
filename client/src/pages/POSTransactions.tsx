import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, TrendingUp, CheckCircle, XCircle, RefreshCw, Search, Eye } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  reversed: "bg-gray-100 text-gray-600",
};

export default function POSTransactions() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const limit = 25;

  const { data, isLoading, isError, refetch } = trpc.posTransactions.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
    terminalId: terminalFilter || undefined,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.posTransactions.stats.useQuery();

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POS Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">Card-present transaction history across all terminals</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Volume", value: formatKobo(stats?.totalAmountKobo ?? 0), icon: TrendingUp, color: "text-blue-600" },
          { label: "Approved", value: stats?.approved ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Declined", value: stats?.declined ?? 0, icon: XCircle, color: "text-red-600" },
          { label: "Total Txns", value: stats?.total ?? 0, icon: CreditCard, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 w-48"
            placeholder="Terminal ID…"
            value={terminalFilter}
            onChange={(e) => { setTerminalFilter(e.target.value); setPage(0); }}
          />
        </div>
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} transactions</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load transactions.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Card Type</TableHead>
                  <TableHead>Masked PAN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transactions found</TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.terminalId}</TableCell>
                    <TableCell className="font-semibold">{formatKobo(r.amountKobo)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.cardType ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.maskedPan ?? "****"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction Detail</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {Object.entries(selected).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium text-right max-w-[60%] break-all">{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
