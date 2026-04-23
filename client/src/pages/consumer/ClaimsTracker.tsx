/**
 * ClaimsTracker — Dedicated insurance claims tracking page with
 * real-time status updates, timeline view, and document upload.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Upload,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; step: number }> = {
  filed: { label: "Filed", color: "bg-blue-100 text-blue-700", icon: <FileText className="h-4 w-4" />, step: 1 },
  under_review: { label: "Under Review", color: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-4 w-4" />, step: 2 },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-4 w-4" />, step: 3 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: <XCircle className="h-4 w-4" />, step: 3 },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-4 w-4" />, step: 4 },
};

const TIMELINE_STEPS = ["Filed", "Under Review", "Decision", "Payment"];

function ClaimTimeline({ status }: { status: string }) {
  const currentStep = STATUS_CONFIG[status]?.step ?? 1;
  const isRejected = status === "rejected";

  return (
    <div className="flex items-center gap-0 mt-3">
      {TIMELINE_STEPS.map((step, i) => {
        const stepNum = i + 1;
        const isComplete = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const isFailed = isRejected && stepNum === 3;

        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  isFailed
                    ? "bg-red-100 border-red-500 text-red-700"
                    : isComplete
                    ? "bg-green-500 border-green-500 text-white"
                    : isCurrent
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {isFailed ? "✗" : isComplete ? "✓" : stepNum}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{step}</span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 ${
                  isComplete ? "bg-green-500" : "bg-muted-foreground/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClaimsTracker() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch } = trpc.newFeatures.consumerInsurance.getClaims.useQuery();

  const claims = (data?.claims ?? []).filter((c: any) => {
    const matchesSearch =
      !search ||
      c.claimNumber?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatKobo = (k: number) =>
    `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const statusCounts = (data?.claims ?? []).reduce(
    (acc: Record<string, number>, c: any) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Claims Tracker</h1>
          <p className="text-muted-foreground">Track all your insurance claims in real-time</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <Card
            key={key}
            className={`cursor-pointer transition-all ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
          >
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{statusCounts[key] ?? 0}</div>
              <div className={`text-xs rounded-full px-2 py-0.5 inline-block mt-1 ${cfg.color}`}>
                {cfg.label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by claim number or description..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          All ({data?.claims?.length ?? 0})
        </Button>
      </div>

      {/* Claims List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading claims...</div>
      ) : claims.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No claims found</p>
            <p className="text-sm text-muted-foreground mt-1">
              File a claim from the Insurance Portal page
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {claims.map((claim: any) => {
            const cfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.filed;
            const isExpanded = expandedId === claim.claimId;

            return (
              <Card key={claim.claimId} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Claim Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${cfg.color}`}>{cfg.icon}</div>
                      <div>
                        <div className="font-semibold">Claim #{claim.claimNumber}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {claim.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Filed:{" "}
                          {claim.filedAt
                            ? new Date(claim.filedAt).toLocaleDateString("en-NG", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="font-bold text-lg">
                        {formatKobo(claim.claimAmountKobo ?? 0)}
                      </div>
                      <Badge className={cfg.color}>{cfg.label}</Badge>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : claim.claimId)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Hide details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> View details
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <ClaimTimeline status={claim.status} />

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Policy:</span>{" "}
                          <span className="font-medium">{claim.policyNumber ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Insurer:</span>{" "}
                          <span className="font-medium">{claim.insurer ?? "PayGate Insurance"}</span>
                        </div>
                        {claim.reviewedAt && (
                          <div>
                            <span className="text-muted-foreground">Reviewed:</span>{" "}
                            <span className="font-medium">
                              {new Date(claim.reviewedAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {claim.paidAt && (
                          <div>
                            <span className="text-muted-foreground">Paid:</span>{" "}
                            <span className="font-medium">
                              {new Date(claim.paidAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {claim.approvedAmountKobo && (
                          <div>
                            <span className="text-muted-foreground">Approved Amount:</span>{" "}
                            <span className="font-medium text-green-600">
                              {formatKobo(claim.approvedAmountKobo)}
                            </span>
                          </div>
                        )}
                      </div>

                      {claim.rejectionReason && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                            <AlertCircle className="h-4 w-4" />
                            Rejection Reason
                          </div>
                          <p className="text-sm text-red-600 mt-1">{claim.rejectionReason}</p>
                        </div>
                      )}

                      {claim.notes && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Adjuster Notes</div>
                          <p className="text-sm text-muted-foreground mt-1">{claim.notes}</p>
                        </div>
                      )}

                      {/* Document Upload */}
                      {(claim.status === "filed" || claim.status === "under_review") && (
                        <div className="border-2 border-dashed rounded-lg p-4 text-center">
                          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Upload supporting documents
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Medical reports, receipts, photos (PDF, JPG, PNG — max 10MB)
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() =>
                              toast.info(
                                "Document upload requires connecting to your storage provider. Contact support@paygate.ng",
                              )
                            }
                          >
                            <Upload className="h-3 w-3 mr-1" /> Choose Files
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
