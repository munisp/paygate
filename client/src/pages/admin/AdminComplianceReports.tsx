// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Download, RefreshCw, Shield, AlertTriangle, CheckCircle } from "lucide-react";

const REPORT_TYPES = [
  { value: "aml_sar", label: "AML Suspicious Activity Report (SAR)", description: "Transactions flagged for suspicious activity" },
  { value: "kyc_status", label: "KYC/KYB Status Report", description: "Merchant and consumer verification status" },
  { value: "transaction_monitoring", label: "Transaction Monitoring Report", description: "High-value and cross-border transaction summary" },
  { value: "fraud_summary", label: "Fraud Summary Report", description: "Fraud alerts, chargebacks, and dispute trends" },
  { value: "regulatory_cbN", label: "CBN Regulatory Report", description: "Central Bank of Nigeria compliance summary" },
  { value: "pep_screening", label: "PEP Screening Report", description: "Politically Exposed Persons screening results" },
];

export default function AdminComplianceReports() {
  const [reportType, setReportType] = useState("");
  const [period, setPeriod] = useState("last_30_days");
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  const generateMutation = trpc.wave27.compliance.generateReport.useMutation({
    onSuccess: (data) => { toast.success("Report generated successfully"); setGeneratedReport(data); },
    onError: (e) => toast.error(e.message),
  });

  const { data: recentReports, refetch, isLoading, isError } = trpc.wave27.compliance.listReports.useQuery();

  const handleGenerate = () => {
    if (!reportType) { toast.error("Please select a report type"); return; }
    generateMutation.mutate({ reportType, period });
  };

  const handleDownload = (report: any) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${report.type}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Reports</h1>
            <p className="text-gray-500 text-sm mt-1">Generate regulatory and compliance reports for CBN, NDIC, and internal audit</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* Report Generator */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Generate Report</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger><SelectValue placeholder="Select report type..." /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <div>
                          <div className="font-medium">{r.label}</div>
                          <div className="text-xs text-gray-500">{r.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                    <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                    <SelectItem value="last_year">Last Year</SelectItem>
                    <SelectItem value="all_time">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending || !reportType}>
              <FileText className="w-4 h-4 mr-2" />
              {generateMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Report Preview */}
        {generatedReport && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="w-5 h-5" />
                  Report Ready — {REPORT_TYPES.find(r => r.value === generatedReport.type)?.label}
                </span>
                <Button size="sm" onClick={() => handleDownload(generatedReport)}>
                  <Download className="w-4 h-4 mr-2" />Download JSON
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-white rounded p-3">
                  <div className="text-gray-500">Period</div>
                  <div className="font-medium capitalize">{generatedReport.period?.replace(/_/g, " ")}</div>
                </div>
                <div className="bg-white rounded p-3">
                  <div className="text-gray-500">Total Records</div>
                  <div className="font-bold text-lg">{generatedReport.totalRecords ?? 0}</div>
                </div>
                <div className="bg-white rounded p-3">
                  <div className="text-gray-500">Flagged Items</div>
                  <div className="font-bold text-lg text-red-600">{generatedReport.flaggedCount ?? 0}</div>
                </div>
                <div className="bg-white rounded p-3">
                  <div className="text-gray-500">Generated At</div>
                  <div className="font-medium">{new Date(generatedReport.generatedAt).toLocaleString()}</div>
                </div>
              </div>
              {generatedReport.summary && (
                <div className="mt-4 bg-white rounded p-4">
                  <div className="font-medium text-sm text-gray-700 mb-2">Summary</div>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-48">
                    {JSON.stringify(generatedReport.summary, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Reports */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Recent Reports</CardTitle></CardHeader>
          <CardContent>
            {!recentReports?.reports?.length ? (
              <div className="text-center py-8 text-gray-500">No reports generated yet. Generate your first report above.</div>
            ) : (
              <div className="space-y-3">
                {recentReports.reports.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-sm">{REPORT_TYPES.find(rt => rt.value === r.type)?.label ?? r.type}</div>
                        <div className="text-xs text-gray-500">{new Date(r.generatedAt).toLocaleString()} · {r.period?.replace(/_/g, " ")}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-gray-100 text-gray-700">{r.totalRecords} records</Badge>
                      {r.flaggedCount > 0 && <Badge className="bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3 mr-1" />{r.flaggedCount} flagged</Badge>}
                      <Button size="sm" variant="outline" onClick={() => handleDownload(r)}><Download className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
