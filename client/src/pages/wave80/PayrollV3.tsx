import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, DollarSign, CheckCircle, Plus, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PayrollV3() {
  const [tab, setTab] = useState("runs");
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [createRunOpen, setCreateRunOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ fullName: "", email: "", department: "General", bankCode: "", accountNumber: "", grossSalary: "" });
  const [runForm, setRunForm] = useState({ runName: "", period: "" });

  const { data: runsData, isLoading: loadingRuns, refetch: refetchRuns } = trpc.wave80.payrollV3.listRuns.useQuery({}, { staleTime: 30_000 });
  const { data: empData, isLoading: loadingEmps, refetch: refetchEmps } = trpc.wave80.payrollV3.listEmployees.useQuery({}, { staleTime: 30_000 });

  const addEmployee = trpc.wave80.payrollV3.addEmployee.useMutation({
    onSuccess: () => { toast.success("Employee added"); setAddEmpOpen(false); refetchEmps(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const createRun = trpc.wave80.payrollV3.createRun.useMutation({
    onSuccess: () => { toast.success("Payroll run created"); setCreateRunOpen(false); refetchRuns(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const processRun = trpc.wave80.payrollV3.processRun.useMutation({
    onSuccess: () => { toast.success("Payroll processed"); refetchRuns(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const runs = runsData?.runs ?? [];
  const employees = empData?.employees ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Payroll V3</h1><p className="text-muted-foreground">Automated payroll processing with tax and pension</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddEmpOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Employee</Button>
          <Button onClick={() => setCreateRunOpen(true)}><Play className="w-4 h-4 mr-2" />Run Payroll</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{employees.length}</p><p className="text-sm text-muted-foreground">Employees</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">&#8358;{(employees.reduce((s: any, e: any) => s + e.grossSalary, 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Monthly Payroll</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{runs.filter(r => r.status === "processed").length}</p><p className="text-sm text-muted-foreground">Completed Runs</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="runs">Payroll Runs</TabsTrigger><TabsTrigger value="employees">Employees</TabsTrigger></TabsList>
        <TabsContent value="runs">
          <Card><CardHeader><CardTitle>Payroll Runs</CardTitle></CardHeader><CardContent>
            {loadingRuns ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            runs.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No payroll runs yet.</p></div> : (
              <div className="space-y-3">{runs.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div><p className="font-medium">{r.runName}</p><p className="text-sm text-muted-foreground">{r.period} | {r.totalEmployees} employees</p></div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold">&#8358;{(r.totalNet / 100).toLocaleString()}</p>
                    <Badge variant={r.status === "processed" ? "default" : "secondary"}>{r.status}</Badge>
                    {r.status === "draft" && <Button size="sm" onClick={() => processRun.mutate({ runId: r.id })}>Process</Button>}
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="employees">
          <Card><CardHeader><CardTitle>Employees</CardTitle></CardHeader><CardContent>
            {loadingEmps ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            employees.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No employees yet.</p></div> : (
              <div className="space-y-3">{employees.map(e => (
                <div key={e.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div><p className="font-medium">{e.fullName}</p><p className="text-sm text-muted-foreground">{e.email} | {e.department}</p></div>
                  <div className="flex items-center gap-3"><p className="font-bold">&#8358;{(e.grossSalary / 100).toLocaleString()}</p><Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status}</Badge></div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <Dialog open={addEmpOpen} onOpenChange={setAddEmpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Full Name</Label><Input value={empForm.fullName} onChange={e => setEmpForm(p => ({ ...p, fullName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={empForm.email} onChange={e => setEmpForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Department</Label><Input value={empForm.department} onChange={e => setEmpForm(p => ({ ...p, department: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Bank Code</Label><Input value={empForm.bankCode} onChange={e => setEmpForm(p => ({ ...p, bankCode: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Account Number</Label><Input value={empForm.accountNumber} onChange={e => setEmpForm(p => ({ ...p, accountNumber: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Gross Salary (kobo)</Label><Input type="number" value={empForm.grossSalary} onChange={e => setEmpForm(p => ({ ...p, grossSalary: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEmpOpen(false)}>Cancel</Button>
            <Button onClick={() => addEmployee.mutate({ fullName: empForm.fullName, email: empForm.email, department: empForm.department, bankCode: empForm.bankCode, accountNumber: empForm.accountNumber, grossSalary: parseInt(empForm.grossSalary) })} disabled={addEmployee.isPending}>{addEmployee.isPending ? "Adding..." : "Add Employee"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createRunOpen} onOpenChange={setCreateRunOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Run Name</Label><Input value={runForm.runName} onChange={e => setRunForm(p => ({ ...p, runName: e.target.value }))} placeholder="e.g. April 2026 Payroll" /></div>
            <div className="space-y-2"><Label>Period</Label><Input value={runForm.period} onChange={e => setRunForm(p => ({ ...p, period: e.target.value }))} placeholder="e.g. 2026-04" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRunOpen(false)}>Cancel</Button>
            <Button onClick={() => createRun.mutate({ runName: runForm.runName, period: runForm.period })} disabled={createRun.isPending}>{createRun.isPending ? "Creating..." : "Create Run"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
