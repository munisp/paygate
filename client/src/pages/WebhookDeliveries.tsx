// @ts-nocheck
/**
 * Webhook Delivery Log Page — /webhooks/deliveries
 * Full-page view with search, status filter, retry, and pagination.
 * Uses trpc.webhookDeliveries.list and trpc.webhookDeliveries.retry.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 25;

type StatusFilter = "all" | "success" | "failed" | "pending" | "retrying";

function statusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Success
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1">
          <Clock className="w-3 h-3" /> Pending
        </Badge>
      );
    case "retrying":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
          <RefreshCw className="w-3 h-3" /> Retrying
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <AlertTriangle className="w-3 h-3" /> {status}
        </Badge>
      );
  }
}

function httpStatusColor(code: number | null | undefined) {
  if (!code) return "text-muted-foreground";
  if (code >= 200 && code < 300) return "text-emerald-600 font-semibold";
  if (code >= 400 && code < 500) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

export default function WebhookDeliveries() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.webhookDeliveries.list.useQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
    },
    { refetchInterval: 30_000 }
  );

  const retryMutation = trpc.webhookDeliveries.retry.useMutation({
    onSuccess: () => {
      toast.success("Delivery retry queued");
      utils.webhookDeliveries.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deliveries: any[] = Array.isArray(data) ? data : (data as any)?.deliveries ?? [];
  const total: number = (data as any)?.total ?? deliveries.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/webhooks">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Webhooks
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Webhook Delivery Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full history of all webhook dispatch attempts — status, HTTP response, retry count
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          {
            label: "Success",
            value: deliveries.filter((d) => d.status === "success").length,
            color: "text-emerald-600",
          },
          {
            label: "Failed",
            value: deliveries.filter((d) => d.status === "failed").length,
            color: "text-red-600",
          },
          {
            label: "Retrying",
            value: deliveries.filter((d) => d.status === "retrying").length,
            color: "text-blue-600",
          },
        ].map((s) => (
          <Card key={s.label} className="border">
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by event type, URL, or delivery ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading deliveries...
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <CheckCircle2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">No deliveries found</p>
              {(search || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Delivery ID</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Endpoint URL</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]">HTTP</TableHead>
                  <TableHead className="w-[70px]">Retries</TableHead>
                  <TableHead className="w-[160px]">Timestamp</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d: any) => (
                  <>
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="cursor-pointer hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(d.id, "Delivery ID");
                              }}
                            >
                              {d.id?.slice(0, 16)}…
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{d.id}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {d.eventType ?? d.event_type ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate text-xs font-mono text-muted-foreground">
                            {d.url ?? d.endpoint_url ?? "—"}
                          </span>
                          {(d.url || d.endpoint_url) && (
                            <a
                              href={d.url ?? d.endpoint_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground shrink-0" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(d.status)}</TableCell>
                      <TableCell>
                        <span className={httpStatusColor(d.httpStatus ?? d.http_status)}>
                          {d.httpStatus ?? d.http_status ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {d.retryCount ?? d.retry_count ?? 0}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.createdAt || d.created_at
                          ? new Date(d.createdAt ?? d.created_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {(d.status === "failed" || d.status === "pending") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={retryMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryMutation.mutate({ deliveryId: d.id });
                                }}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Retry delivery</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                    {/* Expanded row — response body */}
                    {expandedId === d.id && (
                      <TableRow key={`${d.id}-expanded`} className="bg-muted/20">
                        <TableCell colSpan={8} className="p-4">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Request payload */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Request Payload
                                  </span>
                                  {d.requestBody && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => copyToClipboard(d.requestBody, "Payload")}
                                    >
                                      <Copy className="w-3 h-3 mr-1" /> Copy
                                    </Button>
                                  )}
                                </div>
                                <pre className="text-xs bg-background border rounded p-3 overflow-auto max-h-40 font-mono text-muted-foreground">
                                  {d.requestBody
                                    ? (() => {
                                        try {
                                          return JSON.stringify(JSON.parse(d.requestBody), null, 2);
                                        } catch {
                                          return d.requestBody;
                                        }
                                      })()
                                    : "No payload"}
                                </pre>
                              </div>
                              {/* Response body */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Response Body
                                  </span>
                                  {d.responseBody && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => copyToClipboard(d.responseBody, "Response")}
                                    >
                                      <Copy className="w-3 h-3 mr-1" /> Copy
                                    </Button>
                                  )}
                                </div>
                                <pre className="text-xs bg-background border rounded p-3 overflow-auto max-h-40 font-mono text-muted-foreground">
                                  {d.responseBody ?? d.response_body ?? "No response"}
                                </pre>
                              </div>
                            </div>
                            {/* Error message */}
                            {(d.errorMessage ?? d.error_message) && (
                              <div className="bg-red-50 border border-red-200 rounded p-3">
                                <span className="text-xs font-semibold text-red-700">Error: </span>
                                <span className="text-xs text-red-600">
                                  {d.errorMessage ?? d.error_message}
                                </span>
                              </div>
                            )}
                            {/* Timing */}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              {(d.durationMs ?? d.duration_ms) != null && (
                                <span>
                                  Duration:{" "}
                                  <strong className="text-foreground">
                                    {d.durationMs ?? d.duration_ms}ms
                                  </strong>
                                </span>
                              )}
                              {(d.nextRetryAt ?? d.next_retry_at) && (
                                <span>
                                  Next retry:{" "}
                                  <strong className="text-foreground">
                                    {new Date(d.nextRetryAt ?? d.next_retry_at).toLocaleString()}
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} deliveries
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="flex items-center text-sm px-2">
              Page {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
