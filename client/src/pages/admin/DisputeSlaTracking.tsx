import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle, TrendingUp, Timer } from "lucide-react";

export default function DisputeSlaTracking() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [slaFilter, setSlaFilter] = useState<string | undefined>(undefined);

  const { data: trackingData, refetch } = trpc.wave31.disputeSla.list.useQuery({
    status: statusFilter,
    slaBreached: slaFilter === "breached" ? true : slaFilter === "at_risk" ? false : undefined,
  });
  const { data: statsData } = trpc.wave31.disputeSla.getStats.useQuery();

  const escalate = trpc.wave31.disputeSla.escalate.useMutation({
    onSuccess: () => { toast.success("Dispute escalated"); refetch(); },
  });

  const records = (trackingData as any)?.records ?? [];
  const stats = statsData as any;

  const slaStatusBadge = (record: any) => {
    const hoursRemaining = record.hours_remaining;
    if (record.sla_breached) return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Breached</span>;
    if (hoursRemaining <= 4) return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">At Risk ({hoursRemaining}h)</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">On Track ({hoursRemaining}h)</span>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispute SLA Tracking</h1>
          <p className="text-muted-foreground">Monitor dispute resolution timelines and SLA compliance</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter ?? "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {['open', 'under_review', 'awaiting_evidence', 'escalated', 'resolved', 'closed'].map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={slaFilter ?? "all"} onValueChange={v => setSlaFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="SLA Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SLA</SelectItem>
              <SelectItem value="breached">Breached</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Disputes", value: stats?.total ?? 0, icon: AlertTriangle, color: "text-blue-600" },
          { label: "SLA Breached", value: stats?.breached ?? 0, icon: Clock, color: "text-red-600" },
          { label: "At Risk", value: stats?.at_risk ?? 0, icon: Timer, color: "text-orange-600" },
          { label: "SLA Compliance", value: `${stats?.total ? Math.round(((Number(stats.total) - Number(stats.breached)) / Number(stats.total)) * 100) : 100}%`, icon: TrendingUp, color: "text-green-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SLA Tracking Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispute SLA Status ({records.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispute ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA Deadline</TableHead>
                <TableHead>SLA Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No disputes matching filters
                  </TableCell>
                </TableRow>
              ) : records.map((rec: any) => (
                <TableRow key={rec.id} className={rec.sla_breached ? 'bg-red-50' : ''}>
                  <TableCell className="font-mono text-xs">#{rec.dispute_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{rec.dispute_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      rec.priority === 'critical' ? 'bg-red-100 text-red-700' :
                      rec.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{rec.priority}</span>
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                      {rec.status?.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {rec.sla_deadline ? new Date(rec.sla_deadline).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>{slaStatusBadge(rec)}</TableCell>
                  <TableCell className="text-sm">{rec.assigned_agent ?? 'Unassigned'}</TableCell>
                  <TableCell>
                    {rec.status !== 'escalated' && rec.status !== 'resolved' && (
                      <Button size="sm" variant="outline" className="text-orange-600 text-xs" onClick={() => escalate.mutate({ id: rec.id, reason: "Manual escalation" })}>
                        Escalate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
