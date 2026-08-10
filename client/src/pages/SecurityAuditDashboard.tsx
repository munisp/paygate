import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Lock, Unlock,
  Activity, Eye, Zap, RefreshCw, Play, Info, Loader2,
  ShieldAlert, ShieldCheck, ShieldX, Server, Database, Key
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

// ─── Risk level badge ─────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    unknown:  "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return <Badge className={`border ${map[level] ?? map.unknown}`}>{level}</Badge>;
}

// ─── Pen-test check row ───────────────────────────────────────────────────────
function PenCheckRow({ check }: { check: any }) {
  const icon = check.status === "pass"
    ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
    : check.status === "warn"
    ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{check.label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{check.detail}</p>
      </div>
      <Badge className={`text-xs border shrink-0 ${
        check.status === "pass" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        : check.status === "warn" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-red-500/10 text-red-400 border-red-500/20"
      }`}>{check.status}</Badge>
    </div>
  );
}

// ─── PBAC Permission Evaluator ────────────────────────────────────────────────
function PbacEvaluator() {
  const [subject, setSubject] = useState("merchant");
  const [permission, setPermission] = useState("read");
  const [resource, setResource] = useState("transaction");
  const [result, setResult] = useState<any>(null);

  const evalMutation = trpc.securityAudit.evaluatePermission.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Subject (Role)</label>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["admin", "merchant", "viewer", "developer"].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Permission</label>
          <Select value={permission} onValueChange={setPermission}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["read", "write", "delete", "manage", "approve"].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Resource</label>
          <Select value={resource} onValueChange={setResource}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["transaction", "payout", "api_key", "customer", "*"].map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        className="w-full bg-amber-500 hover:bg-amber-600 text-black"
        disabled={evalMutation.isPending}
        onClick={() => evalMutation.mutate({ subject, permission, resource })}
      >
        {evalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
        Evaluate Permission
      </Button>
      {result && (
        <div className={`rounded-lg p-4 border ${result.allowed ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
          <div className="flex items-center gap-2">
            {result.allowed
              ? <ShieldCheck className="w-5 h-5 text-emerald-400" />
              : <ShieldX className="w-5 h-5 text-red-400" />}
            <p className={`font-semibold ${result.allowed ? "text-emerald-400" : "text-red-400"}`}>
              {result.allowed ? "ALLOWED" : "DENIED"}
            </p>
          </div>
          <p className="text-xs text-zinc-400 mt-2">{result.reason}</p>
          {result.matchedPolicy && (
            <p className="text-xs text-zinc-500 mt-1">Policy: <span className="font-mono text-zinc-400">{result.matchedPolicy}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SecurityAuditDashboard() {
  const [days, setDays] = useState(30);
  const [penTestRunning, setPenTestRunning] = useState(false);
  const [penTestResult, setPenTestResult] = useState<any>(null);

  const { data: vulnReport, isLoading: vulnLoading, refetch: refetchVuln } =
    trpc.securityAudit.getVulnerabilityReport.useQuery({ days }, { staleTime: 60_000 });

  const { data: wafSummary, isLoading: wafLoading } =
    trpc.securityAudit.getWafSummary.useQuery({ days }, { staleTime: 60_000 });

  const { data: pbacData } =
    trpc.securityAudit.getPbacPolicies.useQuery({}, { staleTime: 300_000 });

  const { data: nightlyAudit, isLoading: nightlyLoading } =
    trpc.system.nightlyAuditStatus.useQuery(undefined, { staleTime: 60_000, retry: false });

  const penTestMutation = trpc.securityAudit.runPenetrationCheck.useMutation({
    onSuccess: (data) => {
      setPenTestResult(data);
      setPenTestRunning(false);
      toast.success(`Pen-test complete — Score: ${data.score}%`);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setPenTestRunning(false);
    },
  });

  const vr = vulnReport as any;
  const ws = wafSummary as any;
  const pb = pbacData as any;

  const riskColor = vr?.riskLevel === "critical" ? "text-red-400"
    : vr?.riskLevel === "high" ? "text-orange-400"
    : vr?.riskLevel === "medium" ? "text-amber-400"
    : "text-emerald-400";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Audit Dashboard</h1>
          <p className="text-zinc-400 mt-1">PBAC policy analysis, vulnerability scoring, and threat surface mapping</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" aria-label="Refresh" onClick={() => refetchVuln()}><RefreshCw/>
            Refresh
          </Button>
        </div>
      </div>

      {/* Nightly Security Audit Status Card */}
      {(() => {
        const na = nightlyAudit as any;
        const gradeColor = na?.grade === "A+" || na?.grade === "A" ? "text-emerald-400"
          : na?.grade === "B" ? "text-amber-400"
          : na?.grade ? "text-red-400" : "text-zinc-500";
        return (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-lg">
                    <Shield className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Nightly Security Audit</p>
                    <p className="text-xs text-zinc-500">
                      {nightlyLoading ? "Loading…" : na?.runAt ? `Last run: ${new Date(na.runAt).toLocaleString()}` : "No run recorded yet — fires at 02:00 UTC"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {na?.score != null && (
                    <div className="text-right">
                      <p className={`text-2xl font-bold font-mono ${gradeColor}`}>{na.grade}</p>
                      <p className="text-xs text-zinc-500">{na.score}/100</p>
                    </div>
                  )}
                  {na?.p0Failures != null && (
                    <div className="flex gap-2">
                      <Badge className={`border text-xs ${na.p0Failures > 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                        {na.p0Failures} P0
                      </Badge>
                      <Badge className={`border text-xs ${na.p1Failures > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-700/30 text-zinc-400 border-zinc-700/30"}`}>
                        {na.p1Failures} P1
                      </Badge>
                    </div>
                  )}
                  {!na?.ok && !nightlyLoading && (
                    <Badge className="border text-xs bg-zinc-700/30 text-zinc-400 border-zinc-700/30">Pending</Badge>
                  )}
                </div>
              </div>
              {na?.checks?.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-1.5">
                  {(na.checks as Array<{ id: string; severity: string; label: string; pass: boolean }>).map((c) => (
                    <div key={c.id} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                      c.pass ? "bg-emerald-500/10 text-emerald-400" : c.severity === "P0" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {c.pass ? <CheckCircle className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{c.label.split(" ").slice(0, 3).join(" ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-400 text-xs">Vulnerability Score</p>
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <p className={`text-3xl font-bold font-mono ${riskColor}`}>
              {vulnLoading ? "—" : `${vr?.overallScore ?? 0}`}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={vr?.overallScore ?? 0} className="h-1.5 flex-1 bg-zinc-800" />
              {vr?.riskLevel && <RiskBadge level={vr.riskLevel} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-400 text-xs">WAF Alerts ({days}d)</p>
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold font-mono text-white">{ws?.total ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">{ws?.blockedIps ?? 0} unique IPs blocked</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-400 text-xs">PBAC Policies</p>
              <Key className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-3xl font-bold font-mono text-white">{pb?.total ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">Active access control rules</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-400 text-xs">Pen-Test Score</p>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold font-mono text-emerald-400">
              {penTestResult ? `${penTestResult.score}%` : "—"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {penTestResult ? `${penTestResult.passed}/${penTestResult.checks.length} checks passed` : "Run pen-test below"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vulnerabilities" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-zinc-800">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="waf" className="data-[state=active]:bg-zinc-800">WAF Alerts</TabsTrigger>
          <TabsTrigger value="pbac" className="data-[state=active]:bg-zinc-800">PBAC Policies</TabsTrigger>
          <TabsTrigger value="pentest" className="data-[state=active]:bg-zinc-800">Pen-Test</TabsTrigger>
        </TabsList>

        {/* Vulnerabilities Tab */}
        <TabsContent value="vulnerabilities">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Threat Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {vulnLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  </div>
                ) : (vr?.threats ?? []).map((t: any) => (
                  <div key={t.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{t.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">{t.count} events</span>
                        <span className="font-mono font-semibold text-white">{t.score}pts</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${t.score > 20 ? "bg-red-500" : t.score > 10 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(t.score * 2, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                {(vr?.recommendations ?? []).length === 0 ? (
                  <div className="text-center py-8">
                    <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-zinc-500 text-sm">No active threats detected</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {(vr?.recommendations ?? []).map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-zinc-300">{rec}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WAF Alerts Tab */}
        <TabsContent value="waf">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white">WAF Alert Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {wafLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                </div>
              ) : (ws?.byType ?? []).length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No WAF alerts in the selected period</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(ws?.byType ?? []).map((item: any) => (
                    <div key={item.attackType} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-mono">{item.attackType}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-500">{item.count} events</span>
                          <span className="text-zinc-400 font-semibold">{item.pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500/70 rounded-full" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PBAC Policies Tab */}
        <TabsContent value="pbac">
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-purple-400" />
                  Permission Evaluator
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PbacEvaluator />
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Active PBAC Policies</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Policy ID</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Subject</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Permission</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Resource</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pb?.policies ?? []).map((p: any) => (
                        <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-xs font-mono text-zinc-400">{p.id}</td>
                          <td className="px-4 py-3">
                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">{p.subject}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-zinc-300">{p.permission}</td>
                          <td className="px-4 py-3 text-xs font-mono text-zinc-300">{p.resource}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs border ${p.effect === "allow" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                              {p.effect}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Pen-Test Tab */}
        <TabsContent value="pentest">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Security Checklist Scan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!penTestResult && (
                <div className="text-center py-8">
                  <ShieldAlert className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm mb-4">Run an automated security checklist to identify vulnerabilities</p>
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                    disabled={penTestRunning || penTestMutation.isPending}
                    onClick={() => {
                      setPenTestRunning(true);
                      penTestMutation.mutate({ merchantId: "current" });
                    }}
                  >
                    {penTestRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    Run Security Scan
                  </Button>
                </div>
              )}
              {penTestResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`text-3xl font-bold font-mono ${penTestResult.score >= 80 ? "text-emerald-400" : penTestResult.score >= 60 ? "text-amber-400" : "text-red-400"}`}>
                        {penTestResult.score}%
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">Security Score</p>
                        <p className="text-xs text-zinc-500">
                          {penTestResult.passed} passed · {penTestResult.warned} warnings · {penTestResult.failed} failed
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      aria-label="Refresh" onClick={() => {
                        setPenTestRunning(true);
                        penTestMutation.mutate({ merchantId: "current" });
                      }}
                    ><RefreshCw/>
                      Re-run
                    </Button>
                  </div>
                  <Progress value={penTestResult.score} className="h-2 bg-zinc-800" />
                  <div className="space-y-0">
                    {penTestResult.checks.map((check: any) => (
                      <PenCheckRow key={check.id} check={check} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
