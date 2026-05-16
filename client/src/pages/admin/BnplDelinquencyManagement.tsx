import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, DollarSign, Clock, TrendingDown, RefreshCw } from "lucide-react";
import { useState } from "react";

const COLLECTION_STATUSES = ['pending', 'first_notice', 'second_notice', 'legal_action', 'written_off', 'recovered'] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  first_notice: "bg-yellow-100 text-yellow-700",
  second_notice: "bg-orange-100 text-orange-700",
  legal_action: "bg-red-100 text-red-700",
  written_off: "bg-gray-200 text-gray-500",
  recovered: "bg-green-100 text-green-700",
};

export default function BnplDelinquencyManagement() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: recordsData, refetch, isLoading, isError } = trpc.wave31.bnplDelinquency.list.useQuery({ status: statusFilter });
  const { data: statsData } = trpc.wave31.bnplDelinquency.getStats.useQuery();

  const updateStatus = trpc.wave31.bnplDelinquency.updateCollectionStatus.useMutation({
    onSuccess: () => { toast.success("Collection status updated"); refetch(); },
    onError: () => toast.error("Failed to update status"),
  });

  const runCheck = trpc.wave31.bnplDelinquency.runDelinquencyCheck.useMutation({
    onSuccess: () => { toast.success("Delinquency check completed"); refetch(); },
  });

  const records = (recordsData as any)?.records ?? [];
  const stats = statsData as any;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BNPL Delinquency Management</h1>
          <p className="text-muted-foreground">Track and manage overdue BNPL loans and collection actions</p>
        </div>
        <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${runCheck.isPending ? 'animate-spin' : ''}`} />
          Run Delinquency Check
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Delinquent", value: stats?.total_delinquent ?? 0, icon: AlertTriangle, color: "text-red-600" },
          { label: "Total Overdue", value: `₦${Number(stats?.total_overdue_amount ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-orange-600" },
          { label: "Total Penalties", value: `₦${Number(stats?.total_penalties ?? 0).toLocaleString()}`, icon: TrendingDown, color: "text-red-500" },
          { label: "Avg Days Overdue", value: `${Number(stats?.avg_days_overdue ?? 0).toFixed(0)} days`, icon: Clock, color: "text-yellow-600" },
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Delinquent Accounts ({records.length})</CardTitle>
          <Select value={statusFilter ?? "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {COLLECTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Days Overdue</TableHead>
                <TableHead>Overdue Amount</TableHead>
                <TableHead>Penalty</TableHead>
                <TableHead>Collection Status</TableHead>
                <TableHead>Update Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((rec: any) => (
                <TableRow key={rec.id}>
                  <TableCell className="font-mono text-xs">#{rec.loan_id}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{rec.user_name ?? `User #${rec.user_id}`}</p>
                      <p className="text-xs text-muted-foreground">{rec.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`font-bold ${Number(rec.days_overdue) > 90 ? 'text-red-600' : Number(rec.days_overdue) > 30 ? 'text-orange-600' : 'text-yellow-600'}`}>
                      {rec.days_overdue} days
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold">₦{Number(rec.overdue_amount).toLocaleString()}</TableCell>
                  <TableCell className="text-red-600">₦{Number(rec.penalty_amount).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[rec.collection_status] ?? ''}`}>
                      {rec.collection_status?.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Select onValueChange={v => updateStatus.mutate({ id: rec.id, collectionStatus: v as any })}>
                      <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="Update..." /></SelectTrigger>
                      <SelectContent>
                        {COLLECTION_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
