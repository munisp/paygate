import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Download, RefreshCw, AlertTriangle, AlertCircle, Info } from "lucide-react";

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, refetch } = trpc.wave25.auditLog.list.useQuery({
    page,
    limit: 50,
    entityType: entityType === "all" ? undefined : entityType,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.wave25.auditLog.getStats.useQuery();

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "destructive";
      case "high": return "destructive";
      case "medium": return "secondary";
      default: return "outline";
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertCircle className="h-3 w-3" />;
      case "high": return <AlertTriangle className="h-3 w-3" />;
      default: return <Info className="h-3 w-3" />;
    }
  };

  const filtered = data?.rows.filter(r =>
    !search || r.action?.toLowerCase().includes(search.toLowerCase()) ||
    r.merchantId?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Audit Log
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Security events, fraud alerts, and system activity
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Events", value: stats?.total ?? 0, color: "text-foreground" },
            { label: "Critical", value: stats?.critical ?? 0, color: "text-red-500" },
            { label: "High", value: stats?.high ?? 0, color: "text-orange-500" },
            { label: "Today", value: stats?.today ?? 0, color: "text-blue-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by action or merchant ID..."
                  className="pl-8"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={entityType ?? "all"} onValueChange={v => { setEntityType(v === "all" ? undefined : v); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Entity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="fraud_alert">Fraud Alert</SelectItem>
                  <SelectItem value="transaction">Transaction</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading audit events...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No audit events found
                    </TableCell>
                  </TableRow>
                ) : filtered.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id.slice(0, 12)}...</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.entityType}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.action}</TableCell>
                    <TableCell>
                      <Badge variant={severityColor(row.severity ?? "low") as "destructive" | "secondary" | "outline"} className="text-xs flex items-center gap-1 w-fit">
                        {severityIcon(row.severity ?? "low")}
                        {row.severity ?? "low"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.merchantId?.slice(0, 12) ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.transactionId?.slice(0, 12) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.total > 50 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, data.total)} of {data.total.toLocaleString()} events
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
