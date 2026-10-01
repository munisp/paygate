// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Search, CheckCircle, XCircle, Eye, TrendingUp, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  more_info_required: "bg-orange-100 text-orange-800",
  expired: "bg-gray-100 text-gray-700",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

export default function AdminBnplUnderwriting() {
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [underwriterNote, setUnderwriterNote] = useState("");
  const [approvedLimit, setApprovedLimit] = useState("");

  const { data, isLoading, refetch } = trpc.wave27.bnplUnderwriting.listApplications.useQuery(undefined, { staleTime: 30_000 });

  // Server has no manual approve/reject underwriting endpoint — underwriting
  // decisions are computed server-side by bnplUnderwriting.submitApplication.
  const unavailable = (action: string) => () =>
    toast.error(`Manual ${action} is not available: the server exposes automated underwriting only.`);

  const applications = ((data ?? []) as any[])
    .filter((a: any) => !search || a.consumer_id?.toLowerCase().includes(search.toLowerCase()) || a.consumer_email?.toLowerCase().includes(search.toLowerCase()))
    .map((a: any) => ({
      ...a,
      credit_score: a.credit_score ?? a.score,
      risk_level: a.risk_level ?? ((a.score ?? 0) >= 70 ? "low" : (a.score ?? 0) >= 40 ? "medium" : "high"),
    }));
  const stats = {
    pendingCount: applications.filter(a => a.status === "pending_review" || a.status === "conditional").length,
    approvedCount: applications.filter(a => a.status === "approved").length,
    rejectedCount: applications.filter(a => a.status === "rejected" || a.status === "declined").length,
    avgCreditScore: applications.length ? Math.round(applications.reduce((s, a) => s + (a.credit_score ?? 0), 0) / applications.length) : 0,
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">BNPL Underwriting</h1>
            <p className="text-gray-500 text-sm mt-1">Review and approve Buy Now Pay Later credit applications</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="text-sm text-yellow-700">Pending Review</div>
              <div className="text-2xl font-bold text-yellow-800 mt-1">{stats.pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Approved</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{stats.approvedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Rejected</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{stats.rejectedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Avg Credit Score</div>
              <div className="text-2xl font-bold mt-1">{stats.avgCreditScore}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by consumer ID or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Applications Table */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" />Applications ({applications.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading applications...</div>
            ) : applications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No BNPL applications found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Consumer</th>
                      <th className="text-right py-3 px-2">Requested Limit</th>
                      <th className="text-right py-3 px-2">Credit Score</th>
                      <th className="text-left py-3 px-2">Risk Level</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Applied</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app: any) => (
                      <tr key={app.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2">{app.consumer_id}</td>
                        <td className="py-3 px-2 text-right font-medium">₦{Number(app.requested_limit || 0).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right">
                          <span className={app.credit_score >= 700 ? "text-green-600 font-medium" : app.credit_score >= 600 ? "text-yellow-600" : "text-red-600"}>
                            {app.credit_score ?? "—"}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={RISK_COLORS[app.risk_level] ?? "bg-gray-100 text-gray-700"}>{app.risk_level}</Badge>
                        </td>
                        <td className="py-3 px-2">
                          <Badge className={STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}>
                            {app.status?.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-500">{app.created_at ? new Date(app.created_at).toLocaleDateString() : "—"}</td>
                        <td className="py-3 px-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedApp(app); setUnderwriterNote(""); setApprovedLimit(String(app.requested_limit || "")); }}>
                            <Eye className="w-3 h-3 mr-1" />Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>BNPL Application Review</DialogTitle></DialogHeader>
            {selectedApp && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium text-gray-500">Consumer:</span> {selectedApp.consumer_id}</div>
                  <div><span className="font-medium text-gray-500">Credit Score:</span> <span className="font-bold">{selectedApp.credit_score}</span></div>
                  <div><span className="font-medium text-gray-500">Requested Limit:</span> ₦{Number(selectedApp.requested_limit || 0).toLocaleString()}</div>
                  <div><span className="font-medium text-gray-500">Risk Level:</span>
                    <Badge className={`ml-2 ${RISK_COLORS[selectedApp.risk_level] ?? ""}`}>{selectedApp.risk_level}</Badge>
                  </div>
                  <div><span className="font-medium text-gray-500">Monthly Income:</span> ₦{Number(selectedApp.monthly_income || 0).toLocaleString()}</div>
                  <div><span className="font-medium text-gray-500">Existing Debt:</span> ₦{Number(selectedApp.existing_debt || 0).toLocaleString()}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Approved Limit (₦)</label>
                  <Input type="number" value={approvedLimit} onChange={(e) => setApprovedLimit(e.target.value)} placeholder="Enter approved credit limit" />
                </div>
                <div>
                  <label className="text-sm font-medium">Underwriter Note</label>
                  <Textarea value={underwriterNote} onChange={(e) => setUnderwriterNote(e.target.value)} placeholder="Decision rationale..." rows={3} />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelectedApp(null)}>Cancel</Button>
              {selectedApp?.status === "pending_review" && (
                <>
                  <Button variant="outline" className="text-red-600 border-red-200"
                    onClick={unavailable("reject")}
                    disabled={false}>
                    <XCircle className="w-4 h-4 mr-2" />Reject
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700"
                    onClick={unavailable("approve")}
                    disabled={!approvedLimit}>
                    <CheckCircle className="w-4 h-4 mr-2" />Approve
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
