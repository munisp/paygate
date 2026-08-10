// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Package, Search, Filter, ChevronRight, Clock, CheckCircle2, Truck,
  XCircle, RefreshCw, Download, MoreHorizontal, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function fmt(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: "Pending",    color: "bg-amber-100 text-amber-700 border-amber-200",    icon: Clock },
  confirmed:  { label: "Confirmed",  color: "bg-blue-100 text-blue-700 border-blue-200",       icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: RefreshCw },
  shipped:    { label: "Shipped",    color: "bg-purple-100 text-purple-700 border-purple-200", icon: Truck },
  delivered:  { label: "Delivered",  color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled:  { label: "Cancelled",  color: "bg-rose-100 text-rose-700 border-rose-200",       icon: XCircle },
  refunded:   { label: "Refunded",   color: "bg-gray-100 text-gray-700 border-gray-200",       icon: AlertCircle },
};

const FULFILMENT_CONFIG: Record<string, { label: string; color: string }> = {
  unfulfilled: { label: "Unfulfilled", color: "bg-amber-50 text-amber-700" },
  partial:     { label: "Partial",     color: "bg-blue-50 text-blue-700" },
  fulfilled:   { label: "Fulfilled",   color: "bg-emerald-50 text-emerald-700" },
  returned:    { label: "Returned",    color: "bg-gray-50 text-gray-700" },
};

export default function OrderManagement() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfilmentFilter, setFulfilmentFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.ecommerce.orders.list.useQuery({
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    fulfilmentStatus: fulfilmentFilter !== "all" ? fulfilmentFilter as any : undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, { staleTime: 15_000 });

  const bulkUpdateMutation = trpc.ecommerce.orders.bulkUpdateStatus.useMutation({
    onSuccess: (res: any) => {
      toast.success(`${res.updated} order(s) updated`);
      setSelectedIds(new Set());
      utils.ecommerce.orders.list.invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Bulk update failed"),
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o: any) => o.id)));
    }
  };

  const statusKpis = [
    { label: "All Orders", value: total, status: "all" },
    { label: "Pending", value: orders.filter((o: any) => o.status === "pending").length, status: "pending" },
    { label: "Processing", value: orders.filter((o: any) => ["confirmed", "processing"].includes(o.status)).length, status: "processing" },
    { label: "Shipped", value: orders.filter((o: any) => o.status === "shipped").length, status: "shipped" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Order Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {statusKpis.map(k => (
          <button
            key={k.status}
            onClick={() => setStatusFilter(k.status)}
            className={`bg-card rounded-xl border p-4 text-left transition-colors ${
              statusFilter === k.status ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20" : "border-border hover:border-indigo-300"
            }`}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold font-mono mt-1">{k.value}</p>
          </button>
        ))}
      </div>

      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search order number, customer..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fulfilmentFilter} onValueChange={v => { setFulfilmentFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Fulfilment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Fulfilment</SelectItem>
            {Object.entries(FULFILMENT_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Bulk Actions <MoreHorizontal className="w-3.5 h-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "confirmed" })}>
                  Mark as Confirmed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "processing" })}>
                  Mark as Processing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "shipped" })}>
                  Mark as Shipped
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-rose-600"
                  onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "cancelled" })}
                >
                  Cancel Orders
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-3 text-left w-10">
                <Checkbox
                  checked={orders.length > 0 && selectedIds.size === orders.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="p-3 text-left font-medium text-muted-foreground">Order</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Fulfilment</th>
              <th className="p-3 text-right font-medium text-muted-foreground">Total</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="p-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No orders found</p>
                </td>
              </tr>
            ) : (
              orders.map((order: any) => {
                const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
                const fulfilCfg = FULFILMENT_CONFIG[order.fulfilmentStatus] ?? FULFILMENT_CONFIG.unfulfilled;
                const StatusIcon = statusCfg.icon;
                return (
                  <tr key={order.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </td>
                    <td className="p-3">
                      <p className="font-mono font-semibold text-xs text-indigo-600">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{order.paymentMethod?.replace(/_/g, " ")}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-medium text-xs">{order.shippingName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{order.shippingEmail ?? ""}</p>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${fulfilCfg.color}`}>
                        {fulfilCfg.label}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-xs">
                      {fmt(Number(order.totalKobo))}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(order.createdAt)}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
