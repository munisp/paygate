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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, FileText, CheckCircle, XCircle, AlertCircle, Clock, Eye, RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  requires_more_info: "bg-orange-100 text-orange-800",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  submitted: <Clock className="w-4 h-4" />,
  under_review: <AlertCircle className="w-4 h-4" />,
  approved: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  requires_more_info: <AlertCircle className="w-4 h-4" />,
};

export default function AdminKybReview() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<string>("");

  const { data, isLoading, refetch } = trpc.wave27.kyb.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  }, { staleTime: 30_000 });

  const updateMutation = trpc.wave27.kyb.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("KYB application updated successfully");
      refetch();
      setSelectedApp(null);
      setReviewNote("");
      setReviewAction("");
    },
    onError: (e) => toast.error(e.message),
  });

  const apps = data?.applications ?? [];
  const stats = data?.stats ?? { submitted: 0, under_review: 0, approved: 0, rejected: 0, requires_more_info: 0 };

  const handleReview = () => {
    if (!selectedApp || !reviewAction) return;
    updateMutation.mutate({
      merchantId: selectedApp.merchant_id,
      status: reviewAction,
      reviewNote: reviewNote || undefined,
    });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">KYB / KYC Review</h1>
            <p className="text-gray-500 text-sm mt-1">Review and approve merchant business verification applications</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(stats).map(([status, count]) => (
            <Card key={status} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(status)}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{count as number}</div>
                <div className="text-xs text-gray-500 capitalize mt-1">{status.replace(/_/g, " ")}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by merchant ID or business name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="requires_more_info">Requires More Info</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Applications Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              KYB Applications ({apps.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading applications...</div>
            ) : apps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No applications found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Merchant ID</th>
                      <th className="text-left py-3 px-2">Business Name</th>
                      <th className="text-left py-3 px-2">RC Number</th>
                      <th className="text-left py-3 px-2">Business Type</th>
                      <th className="text-left py-3 px-2">Director</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Submitted</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((app: any) => (
                      <tr key={app.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono text-xs">{app.merchant_id}</td>
                        <td className="py-3 px-2 font-medium">{app.business_name}</td>
                        <td className="py-3 px-2 font-mono text-xs">{app.rc_number}</td>
                        <td className="py-3 px-2 capitalize">{app.business_type?.replace(/_/g, " ")}</td>
                        <td className="py-3 px-2">{app.director_name}</td>
                        <td className="py-3 px-2">
                          <Badge className={`${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"} flex items-center gap-1 w-fit`}>
                            {STATUS_ICONS[app.status]}
                            {app.status?.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-gray-500 text-xs">
                          {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedApp(app); setReviewNote(app.review_note ?? ""); }}
                          >
                            <Eye className="w-3 h-3 mr-1" /> Review
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>KYB Review — {selectedApp?.business_name}</DialogTitle>
            </DialogHeader>
            {selectedApp && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium text-gray-500">Merchant ID:</span> <span className="font-mono">{selectedApp.merchant_id}</span></div>
                  <div><span className="font-medium text-gray-500">RC Number:</span> {selectedApp.rc_number}</div>
                  <div><span className="font-medium text-gray-500">Tax ID:</span> {selectedApp.tax_id ?? "Not provided"}</div>
                  <div><span className="font-medium text-gray-500">Business Type:</span> <span className="capitalize">{selectedApp.business_type?.replace(/_/g, " ")}</span></div>
                  <div className="col-span-2"><span className="font-medium text-gray-500">Address:</span> {selectedApp.business_address}</div>
                  <div><span className="font-medium text-gray-500">Director:</span> {selectedApp.director_name}</div>
                  <div><span className="font-medium text-gray-500">BVN:</span> {selectedApp.director_bvn ?? "Not provided"}</div>
                  <div><span className="font-medium text-gray-500">NIN:</span> {selectedApp.director_nin ?? "Not provided"}</div>
                  <div><span className="font-medium text-gray-500">Current Status:</span>
                    <Badge className={`ml-2 ${STATUS_COLORS[selectedApp.status] ?? ""}`}>{selectedApp.status?.replace(/_/g, " ")}</Badge>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-2">
                  <div className="font-medium text-sm text-gray-700">Documents</div>
                  <div className="flex gap-3">
                    {selectedApp.cac_document_url ? (
                      <a href={selectedApp.cac_document_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"><FileText className="w-3 h-3 mr-1" /> CAC Document</Button>
                      </a>
                    ) : <span className="text-sm text-gray-400">No CAC document uploaded</span>}
                    {selectedApp.utility_bill_url && (
                      <a href={selectedApp.utility_bill_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"><FileText className="w-3 h-3 mr-1" /> Utility Bill</Button>
                      </a>
                    )}
                  </div>
                </div>

                {/* Review Action */}
                <div className="space-y-2">
                  <div className="font-medium text-sm text-gray-700">Review Decision</div>
                  <Select value={reviewAction} onValueChange={setReviewAction}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under_review">Mark as Under Review</SelectItem>
                      <SelectItem value="approved">Approve</SelectItem>
                      <SelectItem value="rejected">Reject</SelectItem>
                      <SelectItem value="requires_more_info">Request More Information</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="font-medium text-sm text-gray-700">Review Note</div>
                  <Textarea
                    placeholder="Add a review note (optional for approval, required for rejection/more info)..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedApp(null)}>Cancel</Button>
              <Button
                onClick={handleReview}
                disabled={!reviewAction || updateMutation.isPending}
                className={reviewAction === "approved" ? "bg-green-600 hover:bg-green-700" : reviewAction === "rejected" ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {updateMutation.isPending ? "Saving..." : "Submit Decision"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
