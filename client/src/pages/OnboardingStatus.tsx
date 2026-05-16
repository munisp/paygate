/**
 * OnboardingStatus.tsx
 *
 * Merchant onboarding gate — check readiness and trigger go-live.
 * Uses trpc.onboardingGate router (checkReady, markGoLive).
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, Rocket, RefreshCw, AlertCircle, Clock } from "lucide-react";

export default function OnboardingStatus() {
  const { data, isLoading, isError, refetch } = trpc.onboardingGate.checkReady.useQuery();

  const markGoLive = trpc.onboardingGate.markGoLive.useMutation({
    onSuccess: () => {
      toast.success("🚀 Merchant account is now live!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const allPassed = data?.checks?.every((c: any) => c.passed) ?? false;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="w-6 h-6 text-indigo-600" /> Onboarding Status
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Complete all checks to go live on PayGate</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
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
                  onClick={() => markGoLive.mutate({})}
                  disabled={markGoLive.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  {markGoLive.isPending ? "Going Live…" : "Go Live Now"}
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
    </div>
  );
}
