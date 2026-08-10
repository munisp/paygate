// @ts-nocheck
/**
 * OnboardingStatus.tsx
 *
 * Merchant onboarding gate — check readiness and trigger go-live.
 * Uses trpc.onboardingGate router (checkReady, markGoLive).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Rocket, RefreshCw, AlertCircle, Clock, ShieldAlert, Loader2 } from "lucide-react";

const GO_LIVE_CHECKLIST = [
  { id: "kyc", label: "KYC verification has been completed and approved" },
  { id: "bank", label: "Bank account details are verified and active" },
  { id: "webhook", label: "At least one webhook endpoint is configured" },
  { id: "test", label: "Test transactions have been successfully processed" },
  { id: "tnc", label: "I accept the PayGate Merchant Terms & Conditions" },
];

export default function OnboardingStatus() {
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [step, setStep] = useState(1); // 1 = checklist, 2 = final confirm
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = trpc.onboardingGate.checkReady.useQuery();

  const markGoLive = trpc.onboardingGate.markGoLive.useMutation({
    onSuccess: () => {
      toast.success("🚀 Merchant account is now live!");
      setShowGoLiveModal(false);
      setStep(1);
      setCheckedItems(new Set());
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const allPassed = data?.checks?.every((c: any) => c.passed) ?? false;
  const allChecked = GO_LIVE_CHECKLIST.every(item => checkedItems.has(item.id));

  const openGoLiveModal = () => { setStep(1); setCheckedItems(new Set()); setShowGoLiveModal(true); };
  const toggleCheck = (id: string) => { const n = new Set(checkedItems); n.has(id) ? n.delete(id) : n.add(id); setCheckedItems(n); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="w-6 h-6 text-indigo-600" /> Onboarding Status
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Complete all checks to go live on PayGate</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load onboarding status. Please refresh.
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Checking readiness…</div>
      ) : data ? (
        <>
          {/* Overall Status */}
          <Card className={allPassed ? "border-green-300 bg-green-50" : "border-orange-300 bg-orange-50"}>
            <CardContent className="pt-6 pb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {allPassed ? (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                ) : (
                  <Clock className="w-8 h-8 text-orange-500" />
                )}
                <div>
                  <p className="font-bold text-lg">
                    {allPassed ? "Ready to Go Live!" : "Onboarding In Progress"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.checks?.filter((c: any) => c.passed).length ?? 0} of {data.checks?.length ?? 0} checks passed
                  </p>
                </div>
              </div>
              {allPassed && !data.isLive && (
                <Button
                  onClick={openGoLiveModal}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Rocket className="w-4 h-4 mr-2" /> Go Live Now
                </Button>
              )}
              {data.isLive && (
                <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">
                  <CheckCircle className="w-4 h-4 mr-1 inline" /> Live
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Checks List */}
          <Card>
            <CardHeader>
              <CardTitle>Readiness Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.checks?.map((check: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {check.passed ? (
                        <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{check.name ?? check.label ?? `Check ${i + 1}`}</p>
                        {check.description && (
                          <p className="text-xs text-muted-foreground">{check.description}</p>
                        )}
                      </div>
                    </div>
                    <Badge className={check.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}>
                      {check.passed ? "Passed" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
      {/* Go-Live Confirmation Modal */}
      <Dialog open={showGoLiveModal} onOpenChange={(o) => { if (!o) { setShowGoLiveModal(false); setStep(1); } }}>
        <DialogContent className="max-w-md">
          {step === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" /> Pre-Launch Checklist
                </DialogTitle>
                <DialogDescription>
                  Please confirm all prerequisites are met before going live. This action will activate your merchant account for real transactions.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {GO_LIVE_CHECKLIST.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => toggleCheck(item.id)}>
                    <Checkbox checked={checkedItems.has(item.id)} onCheckedChange={() => toggleCheck(item.id)} className="mt-0.5" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGoLiveModal(false)}>Cancel</Button>
                <Button disabled={!allChecked} onClick={() => setStep(2)}>
                  Continue <Rocket className="w-4 h-4 ml-2" />
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-green-600" /> Final Confirmation
                </DialogTitle>
                <DialogDescription>
                  You are about to <strong>activate your merchant account for live production transactions</strong>. This cannot be undone without contacting support.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Real money will be processed once you go live. Ensure your integration has been thoroughly tested.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => markGoLive.mutate({})}
                  disabled={markGoLive.isPending}
                >
                  {markGoLive.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Activating…</> : <><Rocket className="w-4 h-4 mr-2" /> Confirm Go Live</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
