import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, CheckCircle } from "lucide-react";

export default function PayrollV2() {
  const [payPeriod, setPayPeriod] = useState(new Date().toISOString().slice(0, 7));
  const { isLoading, data: runs, refetch } = trpc.tier6to8.payrollV2.getPayrollRuns.useQuery({});
  const createMutation = trpc.tier6to8.payrollV2.createPayrollRun.useMutation({
    onSuccess: (d: any) => { toast.success(`Payroll run created — ${d.employeeCount} employees, \u20a6${(d.totalGrossKobo / 100).toLocaleString()}`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const approveMutation = trpc.tier6to8.payrollV2.approvePayrollRun.useMutation({
    onSuccess: () => { toast.success("Payroll approved and disbursing"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const pensionMutation = trpc.tier6to8.payrollV2.submitPensionRemittance.useMutation({
    onSuccess: (d: any) => toast.success(`Pension remitted — Ref: ${d.remittanceRef}`),
    onError: (e: any) => toast.error(e.message),
  });
  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "completed" ? "default" : s === "failed" ? "destructive" : "secondary";

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-orange-600" />
        <div>
          <h1 className="text-2xl font-bold">Payroll-as-a-Service v2</h1>
          <p className="text-muted-foreground">Automated payroll, PAYE deductions, and pension remittance</p>
        </div>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <input type="month" className="border rounded px-3 py-2 text-sm" value={payPeriod} onChange={e => setPayPeriod(e.target.value)} />
        <Button onClick={() => createMutation.mutate({ payPeriod, payDate: new Date().toISOString().slice(0,10), employees: [], includeNHF: true, includePension: true })} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create Payroll Run"}
        </Button>
        <Button variant="outline" onClick={() => pensionMutation.mutate({ runId: "latest", pfaCode: "PFA001" })} disabled={pensionMutation.isPending}>
          Submit Pension Remittance
        </Button>
      </div>
      <div className="space-y-3">
        {runs?.runs.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex justify-between items-center flex-wrap gap-3">
              <div>
                <p className="font-bold">{r.payPeriod}</p>
                <p className="text-sm text-muted-foreground">{r.employeeCount} employees &middot; Gross: \u20a6{(r.totalGrossKobo / 100).toLocaleString()} &middot; Net: \u20a6{(r.totalNetKobo / 100).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">PAYE: \u20a6{(r.totalPAYEKobo / 100).toLocaleString()} &middot; Pension: \u20a6{(r.totalPensionKobo / 100).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusColor(r.status)}>{r.status}</Badge>
                {r.status === "pending_approval" && (
                  <Button size="sm" onClick={() => approveMutation.mutate({ runId: r.id })}>
                    <CheckCircle className="w-3 h-3 mr-1" />Approve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!runs?.runs.length && <p className="text-center text-muted-foreground py-8">No payroll runs yet. Create your first run above.</p>}
      </div>
    </div>
  );
}
