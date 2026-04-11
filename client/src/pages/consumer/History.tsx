import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Search, Wallet, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatAmount(amount: string, type: string) {
  const n = parseFloat(amount);
  const sign = type === "debit" ? "-" : "+";
  return `${sign}₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function TxIcon({ type }: { type: string }) {
  if (type === "debit") {
    return <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
      <ArrowUpRight className="w-5 h-5 text-red-500" />
    </div>;
  }
  return <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
    <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
  </div>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] ?? variants.pending}`}>
      {status}
    </span>
  );
}

export default function ConsumerHistory() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const walletQuery = trpc.consumerWallet.getBalance.useQuery({ currency: 'NGN' });
  const historyQuery = trpc.consumerWallet.history.useQuery({
    currency: 'NGN',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const balanceKobo = walletQuery.data?.balanceKobo ?? 0;
  const allTxs = historyQuery.data?.rows ?? [];
  const total = historyQuery.data?.total ?? 0;

  const filtered = allTxs.filter((tx) => {
    const matchSearch = !search || (tx.description ?? '').toLowerCase().includes(search.toLowerCase())
      || (tx.reference ?? '').toLowerCase().includes(search.toLowerCase())
      || (tx.counterpartyName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || tx.type === typeFilter;
    return matchSearch && matchType;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-2xl font-bold text-white">Transaction History</h1>
            <p className="text-sm text-slate-400 mt-0.5">All your PayGate transactions</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { walletQuery.refetch(); historyQuery.refetch(); }}

            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>

        {/* Wallet Balance Card */}
        <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-white/70">Available Balance</p>
                {walletQuery.isLoading ? (
                  <Skeleton className="h-8 w-40 bg-white/20" />
                ) : (
                  <p className="text-3xl font-bold text-white">
                    ₦{(balanceKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-4 text-sm text-white/70">
              <span>Currency: <span className="text-white font-medium">{walletQuery.data?.currency ?? "NGN"}</span></span>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search transactions..."
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              className="pl-9 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="credit">Credits</SelectItem>
              <SelectItem value="debit">Debits</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transaction List */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {total} transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {historyQuery.isLoading ? (
              <div className="divide-y divide-slate-700">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="w-10 h-10 rounded-full bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 bg-slate-700" />
                      <Skeleton className="h-3 w-32 bg-slate-700" />
                    </div>
                    <Skeleton className="h-5 w-20 bg-slate-700" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No transactions found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {filtered.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-4 p-4 hover:bg-slate-700/30 transition-colors">
                    <TxIcon type={tx.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                        {tx.counterpartyName && (
                          <span className="text-xs text-slate-500">· {tx.counterpartyName}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 font-mono">{tx.reference}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${tx.type === "debit" || tx.type === "p2p_send" || tx.type === "bill_pay" || tx.type === "qr_pay" || tx.type === "red_envelope_send" ? "text-red-400" : "text-emerald-400"}`}>
                        {formatAmount(String((tx.amountKobo ?? 0) / 100), tx.type)}
                      </p>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              Previous
            </Button>
            <span className="text-sm text-slate-400">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
