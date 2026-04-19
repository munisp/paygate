import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge, Search, RefreshCw, AlertTriangle } from "lucide-react";

export default function AdminRateLimitDashboard() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.wave25.rateLimits.list.useQuery({ page, limit: 50 });
  const { data: stats } = trpc.wave25.rateLimits.getStats.useQuery();

  const filtered = data?.rows.filter(r =>
    !search || r.identifier?.toLowerCase().includes(search.toLowerCase()) ||
    r.endpoint?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gauge className="h-6 w-6 text-primary" />
              Rate Limit Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor API rate limiting events and blocked identifiers
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Events", value: stats?.total ?? 0 },
            { label: "Blocked Requests", value: stats?.blocked ?? 0, color: "text-red-500" },
            { label: "Unique Identifiers", value: stats?.uniqueIdentifiers ?? 0 },
            { label: "Today", value: stats?.today ?? 0, color: "text-blue-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by identifier or endpoint..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Blocked</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No rate limit events found</TableCell>
                  </TableRow>
                ) : filtered.map(row => (
                  <TableRow key={row.id} className={row.blocked ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-mono text-xs">{row.identifier}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.identifierType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.endpoint ?? row.procedure ?? "—"}</TableCell>
                    <TableCell className="font-bold">{row.count}</TableCell>
                    <TableCell className="text-muted-foreground">{row.limitVal}</TableCell>
                    <TableCell>
                      {row.blocked ? (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1 w-fit">
                          <AlertTriangle className="h-3 w-3" /> Blocked
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Allowed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {data && data.total > 50 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
