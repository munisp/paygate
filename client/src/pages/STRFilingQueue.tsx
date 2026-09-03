// @ts-nocheck
/**
 * STRFilingQueue.tsx
 * Pending STRs tab with NFIU countdown badges, one-click goAML submit,
 * and acknowledgement tracking.
 * Wired to: str.getPendingWithCountdown, str.submitToNFIU, str.stats
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Clock, CheckCircle2, Send, RefreshCw, FileText, AlertCircle } from "lucide-react";

type UrgencyLevel = "critical" | "warning" | "normal";

interface PendingSTR {
  id: string;
  reportRef: string;
  strType: string;
  suspicionType: string;
  narrative: string;
  submissionStatus: string;
  submissionAttempts: number;
  deadlineAt: string | null;
  filedAt: string;
  hoursRemaining: number | null;
  isOverdue: boolean;
  urgency: UrgencyLevel;
  deadlineLabel: string;
  nfiuRef: string | null;
  subjectData: { firstName?: string; lastName?: string; name?: string } | null;
  transactionData: { amount: number; currency: string } | null;
}

const urgencyBadge = (urgency: UrgencyLevel, isOverdue: boolean) => {
  if (isOverdue) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Overdue</Badge>;
  if (urgency === "critical") return <Badge variant="destructive" className="gap-1"><Clock className="w-3 h-3" /> Critical</Badge>;
  if (urgency === "warning") return <Badge className="gap-1 bg-amber-500 text-white"><Clock className="w-3 h-3" /> Warning</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> On Track</Badge>;
};

function CountdownBadge({ hoursRemaining, isOverdue }: { hoursRemaining: number | null; isOverdue: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (hoursRemaining === null) return <span className="text-muted-foreground text-xs">No deadline</span>;
  if (isOverdue) return (
    <span className="text-destructive font-semibold text-sm">
      {Math.abs(hoursRemaining)}h overdue
    </span>
  );
  const h = hoursRemaining;
  const colour = h < 4 ? "text-destructive" : h < 12 ? "text-amber-600" : "text-muted-foreground";
  return <span className={`${colour} font-medium text-sm`}>{h}h remaining</span>;
}

export default function STRFilingQueue() {
  const utils = trpc.useUtils();
  const [selectedStr, setSelectedStr] = useState<PendingSTR | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");

  const { data: pending, isLoading: loadingPending, refetch: refetchPending } =
    trpc.str.getPendingWithCountdown.useQuery(
      { includeBreached: true },
      { refetchInterval: 60_000, staleTime: 30_000 }
    );

  const { data: allStrs, isLoading: loadingAll } =
    trpc.str.list.useQuery(
      { page: 1, limit: 50 },
      { enabled: activeTab === "all", staleTime: 30_000 }
    );

  const { data: stats } = trpc.str.stats.useQuery(undefined, { staleTime: 60_000 });

  const submitMutation = trpc.str.submitToNFIU.useMutation({
    onSuccess: (data) => {
      toast.success(`STR submitted to NFIU — Ref: ${data.nfiuRef ?? "pending"}`);
      setConfirmOpen(false);
      setSelectedStr(null);
      refetchPending();
      utils.str.stats.invalidate();
    },
    onError: (e) => toast.error(`Submission failed: ${e.message}`),
  });

  const handleSubmit = (str: PendingSTR) => {
    setSelectedStr(str);
    setConfirmOpen(true);
  };

  const confirmSubmit = () => {
    if (!selectedStr) return;
    submitMutation.mutate({ id: selectedStr.id });
  };

  const criticalCount = pending?.filter(s => s.urgency === "critical" || s.isOverdue).length ?? 0;
  const warningCount = pending?.filter(s => s.urgency === "warning").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">STR Filing Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Suspicious Transaction Reports pending NFIU goAML submission
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchPending()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Critical / Overdue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Warning (&lt;12h)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{pending?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Pending Submission</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {stats?.byStatus?.find(s => s.status === "acknowledged")?.count ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Acknowledged by NFIU</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending Queue
            {criticalCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-1.5 py-0.5">
                {criticalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All STRs</TabsTrigger>
        </TabsList>

        {/* Pending Queue Tab */}
        <TabsContent value="pending" className="mt-4">
          {loadingPending ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : !pending?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium">All STRs submitted</p>
                <p className="text-muted-foreground text-sm mt-1">No pending STRs in the queue.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((str) => (
                <Card key={str.id} className={`border-l-4 ${
                  str.isOverdue ? "border-l-destructive" :
                  str.urgency === "critical" ? "border-l-destructive" :
                  str.urgency === "warning" ? "border-l-amber-500" :
                  "border-l-muted"
                }`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{str.reportRef}</span>
                          {urgencyBadge(str.urgency, str.isOverdue)}
                          <Badge variant="outline" className="text-xs">{str.strType}</Badge>
                          <Badge variant="secondary" className="text-xs">{str.suspicionType}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{str.narrative}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            Filed {new Date(str.filedAt).toLocaleDateString()}
                          </span>
                          {str.transactionData && (
                            <span>
                              {(str.transactionData.amount / 100).toLocaleString()} {str.transactionData.currency}
                            </span>
                          )}
                          <span>Attempts: {str.submissionAttempts}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <CountdownBadge hoursRemaining={str.hoursRemaining} isOverdue={str.isOverdue} />
                        <Button
                          size="sm"
                          variant={str.isOverdue || str.urgency === "critical" ? "destructive" : "default"}
                          className="gap-1"
                          onClick={() => handleSubmit(str)}
                          disabled={submitMutation.isPending}
                        >
                          <Send className="w-3 h-3" />
                          Submit to NFIU
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* All STRs Tab */}
        <TabsContent value="all" className="mt-4">
          {loadingAll ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {allStrs?.strs.map((str: any) => (
                <Card key={str.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{str.reportRef}</span>
                        <Badge variant={
                          str.submissionStatus === "acknowledged" ? "default" :
                          str.submissionStatus === "submitted" ? "secondary" :
                          str.submissionStatus === "failed" ? "destructive" : "outline"
                        }>
                          {str.submissionStatus}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{str.strType} — {str.suspicionType}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {str.nfiuRef && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            {str.nfiuRef}
                          </span>
                        )}
                        <span>{new Date(str.filedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!allStrs?.strs.length && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No STRs filed yet.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm Submit Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Confirm NFIU goAML Submission
            </DialogTitle>
          </DialogHeader>
          {selectedStr && (
            <div className="space-y-3 py-2">
              <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                <div><span className="font-medium">Report Ref:</span> {selectedStr.reportRef}</div>
                <div><span className="font-medium">Type:</span> {selectedStr.strType} — {selectedStr.suspicionType}</div>
                <div><span className="font-medium">Deadline:</span> {selectedStr.deadlineLabel}</div>
                {selectedStr.isOverdue && (
                  <div className="text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    This STR is overdue. Submit immediately.
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                This will submit the STR to NFIU goAML via the secure bridge. The action cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant={selectedStr?.isOverdue ? "destructive" : "default"}
              onClick={confirmSubmit}
              disabled={submitMutation.isPending}
              className="gap-2"
            >
              {submitMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : (
                <><Send className="w-4 h-4" /> Submit to NFIU</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
