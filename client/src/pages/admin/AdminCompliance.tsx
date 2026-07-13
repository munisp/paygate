// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

export default function AdminCompliance() {
  const [sarForm, setSarForm] = useState({ merchantId: "", startDate: "", endDate: "", reason: "" });
  const [regForm, setRegForm] = useState({ reportType: "cbn_monthly" as any, startDate: "", endDate: "" });

  const amlQuery = trpc.admin.compliance.getAMLFlags.useQuery({ page: 1, limit: 20, severity: "all" }, { staleTime: 30_000 });
  const sarMutation = trpc.admin.compliance.generateSARReport.useMutation({
    onSuccess: (data: any) => toast.success(`SAR Report generated: ${data?.reportId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const regQuery = trpc.admin.compliance.getRegulatoryExport.useQuery(regForm, { enabled: false }, { staleTime: 30_000 });

  const flags = (amlQuery.data as any)?.flags ?? [];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Reporting</h1>
          <p className="text-slate-400 text-sm mt-1">AML monitoring, SAR reports, and regulatory exports</p>
        </div>
        <Tabs defaultValue="aml">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="aml" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">AML Flags</TabsTrigger>
            <TabsTrigger value="sar" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">SAR Reports</TabsTrigger>
            <TabsTrigger value="regulatory" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Regulatory Export</TabsTrigger>
          </TabsList>
          <TabsContent value="aml" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> AML Flagged Events</CardTitle></CardHeader>
              <CardContent className="p-0">
                {amlQuery.isLoading ? (
                  <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">ID</TableHead>
                        <TableHead className="text-slate-400">Merchant</TableHead>
                        <TableHead className="text-slate-400">Action</TableHead>
                        <TableHead className="text-slate-400">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flags.map((f: any) => (
                        <TableRow key={f.id} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-slate-400 text-xs font-mono">{f.id?.slice(0, 12)}...</TableCell>
                          <TableCell className="text-slate-300 text-xs font-mono">{f.merchantId?.slice(0, 12)}...</TableCell>
                          <TableCell className="text-amber-400 text-xs">{f.action}</TableCell>
                          <TableCell className="text-slate-400 text-xs">{new Date(f.createdAt).toLocaleDateString("en-NG")}</TableCell>
                        </TableRow>
                      ))}
                      {flags.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No AML flags found</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sar" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base">Generate SAR Report</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-300">Merchant ID</Label>
                    <Input value={sarForm.merchantId} onChange={(e: any) => setSarForm(f => ({ ...f, merchantId: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <Label className="text-slate-300">Start Date</Label>
                    <Input type="date" value={sarForm.startDate} onChange={(e: any) => setSarForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <Label className="text-slate-300">End Date</Label>
                    <Input type="date" value={sarForm.endDate} onChange={(e: any) => setSarForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300">Reason</Label>
                  <Textarea value={sarForm.reason} onChange={(e: any) => setSarForm(f => ({ ...f, reason: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" rows={3} />
                </div>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={sarMutation.isPending || !sarForm.merchantId || !sarForm.startDate || !sarForm.endDate || !sarForm.reason}
                  onClick={() => sarMutation.mutate(sarForm)}>
                  <FileText className="w-4 h-4 mr-2" /> Generate SAR Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="regulatory" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base">Regulatory Export</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-300">Report Type</Label>
                    <Select value={regForm.reportType} onValueChange={(v: any) => setRegForm(f => ({ ...f, reportType: v }))}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="cbn_monthly">CBN Monthly</SelectItem>
                        <SelectItem value="efcc_suspicious">EFCC Suspicious</SelectItem>
                        <SelectItem value="nfiu_ctr">NFIU CTR</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Start Date</Label>
                    <Input type="date" value={regForm.startDate} onChange={(e: any) => setRegForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                  <div>
                    <Label className="text-slate-300">End Date</Label>
                    <Input type="date" value={regForm.endDate} onChange={(e: any) => setRegForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" />
                  </div>
                </div>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={regQuery.isFetching || !regForm.startDate || !regForm.endDate}
                  onClick={() => regQuery.refetch()}>
                  <Download className="w-4 h-4 mr-2" /> Generate Export
                </Button>
                {regQuery.data && (
                  <div className="mt-4 p-4 bg-slate-800 rounded-lg">
                    <p className="text-green-400 text-sm font-medium">Export ready</p>
                    <p className="text-slate-400 text-xs mt-1">Records: {(regQuery.data as any)?.recordCount ?? 0}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
