// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, Shield, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ACTION_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  login: "outline",
  logout: "outline",
  approve: "default",
  reject: "destructive",
};

export default function AuditLogViewer() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: logs, refetch, isLoading, isError, error} = trpc.wave223.auditLogs.list.useQuery({
    search,
    action: actionFilter === "all" ? undefined : actionFilter,
    limit: 100,
  });

  const handleExport = () => {
    if (!logs?.length) return;
    const csv = [
      "Timestamp,Actor,Action,Resource,Resource ID,IP Address",
      ...logs.map((l) =>
        `"${l.createdAt}","${l.actorId}","${l.action}","${l.resourceType}","${l.resourceId ?? ""}","${l.ipAddress ?? ""}"`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isError) return <div className="text-red-500">Error: {error?.message}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-slate-500" /> Audit Log Viewer</h1>
          <p className="text-muted-foreground text-sm mt-1">Immutable record of all platform actions for compliance and forensics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search actor, resource, IP…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {["create", "update", "delete", "login", "logout", "approve", "reject"].map((a) => (
              <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Resource ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading audit logs…</TableCell></TableRow>}
              {!isLoading && !logs?.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No audit logs found.</TableCell></TableRow>}
              {logs?.map((log) => (
                <TableRow key={log.id} className="text-sm">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.actorId ?? "system"}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLORS[log.action ?? ""] ?? "outline"} className="capitalize">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{log.resourceType?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{log.resourceId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{log.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {log.metadata && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>View</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Audit Log Detail</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-muted-foreground">Actor</p><p className="font-mono">{selectedLog?.actorId}</p></div>
              <div><p className="text-muted-foreground">Action</p><Badge variant={ACTION_COLORS[selectedLog?.action ?? ""] ?? "outline"}>{selectedLog?.action}</Badge></div>
              <div><p className="text-muted-foreground">Resource</p><p>{selectedLog?.resourceType}</p></div>
              <div><p className="text-muted-foreground">Resource ID</p><p className="font-mono">{selectedLog?.resourceId}</p></div>
              <div><p className="text-muted-foreground">IP Address</p><p className="font-mono">{selectedLog?.ipAddress ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Timestamp</p><p>{selectedLog?.createdAt ? new Date(selectedLog.createdAt).toLocaleString() : "—"}</p></div>
            </div>
            {selectedLog?.metadata && (
              <div>
                <p className="text-muted-foreground mb-1">Metadata</p>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(JSON.parse(selectedLog.metadata), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
