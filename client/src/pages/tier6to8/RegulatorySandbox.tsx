import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FlaskConical, Play, CheckCircle } from "lucide-react";

export default function RegulatorySandbox() {
  const [selectedScenario, setSelectedScenario] = useState("");
  const { data: status } = trpc.tier6to8.regulatorySandbox.getSandboxStatus.useQuery();
  const { data: scenarios } = trpc.tier6to8.regulatorySandbox.getTestScenarios.useQuery();
  const enableMutation = trpc.tier6to8.regulatorySandbox.enableSandbox.useMutation({
    onSuccess: (d: any) => toast.success(`Sandbox enabled — ID: ${d.sandboxId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const runMutation = trpc.tier6to8.regulatorySandbox.runTestScenario.useMutation({
    onSuccess: (d: any) => toast.success(`Scenario passed: ${d.passed ? "✓" : "✗"} — ${d.message}`),
    onError: (e: any) => toast.error(e.message),
  });
  const submitMutation = trpc.tier6to8.regulatorySandbox.submitForApproval.useMutation({
    onSuccess: (d: any) => toast.success(`Submitted for CBN approval — Ref: ${d.submissionRef}`),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-8 h-8 text-purple-600" />
        <div><h1 className="text-2xl font-bold">Regulatory Sandbox Mode</h1><p className="text-muted-foreground">CBN-compliant sandbox for testing regulated financial products</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Sandbox Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {status && (
              <>
                <div className="flex items-center gap-3">
                  <Badge variant={status.enabled ? "default" : "secondary"} className="text-base px-3 py-1">
                    {status.enabled ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                  {status.sandboxId && <span className="text-sm text-muted-foreground font-mono">{status.sandboxId}</span>}
                </div>
                {status.enabled && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Regulator</span><span className="font-medium">{status.regulatorName}</span></div>
                    <div className="flex justify-between"><span>Test Transactions</span><span className="font-medium">{status.testTransactionCount} / {status.maxTestTransactions}</span></div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${(status.testTransactionCount / status.maxTestTransactions) * 100}%` }} />
                    </div>
                    {status.expiresAt && <div className="flex justify-between"><span>Expires</span><span>{new Date(status.expiresAt).toLocaleDateString()}</span></div>}
                  </div>
                )}
                {!status.enabled && (
                  <Button className="w-full" onClick={() => enableMutation.mutate({ regulatorCode: "CBN", sandboxPurpose: "PayGate Payment Service Testing", testDurationDays: 90 })} disabled={enableMutation.isPending}>
                    {enableMutation.isPending ? "Enabling..." : "Enable Regulatory Sandbox"}
                  </Button>
                )}
                {status.enabled && (
                  <Button className="w-full" variant="outline" onClick={() => status?.sandboxId && submitMutation.mutate({ sandboxId: status.sandboxId, submissionNote: "All test scenarios passed. Ready for CBN review." })} disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? "Submitting..." : "Submit for CBN Approval"}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Play className="w-4 h-4" />Test Scenarios</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {scenarios?.scenarios.map((s: any) => (
              <div key={s.id} className="p-3 border rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <Badge variant="outline" className="text-xs mt-1">{s.category}</Badge>
                </div>
                <Button size="sm" onClick={() => runMutation.mutate({ scenarioId: s.id, parameters: {} })} disabled={runMutation.isPending}>
                  <Play className="w-3 h-3 mr-1" />Run
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
