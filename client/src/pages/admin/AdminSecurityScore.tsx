// @ts-nocheck
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, CheckCircle, XCircle, AlertTriangle, Eye } from "lucide-react";

export default function AdminSecurityScore() {
  const { data, isLoading, isError, error, refetch } = trpc.wave27.security.getScore.useQuery();

  // Real computed score only — "unavailable" when the query fails, never a fabricated 100.
  const score = data?.score ?? null;
  const grade = data?.grade ?? null;
  const gradeColor = score === null ? "text-gray-400" : score >= 90 ? "text-green-600" : score >= 80 ? "text-yellow-600" : "text-red-600";

  const checks = data?.checks ?? [];
  const failed = checks.filter((c: any) => !c.passed);
  const passed = checks.filter((c: any) => c.passed);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security Score</h1>
            <p className="text-gray-500 text-sm mt-1">Platform vulnerability assessment and security posture</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Re-scan</Button>
        </div>

        {isError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Security score unavailable</p>
              <p className="text-xs text-red-600 mt-0.5">{error?.message}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        )}

        {/* Score Card */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-6 text-center">
              <Shield className={`w-12 h-12 mx-auto mb-2 ${score === null ? "text-gray-300" : "text-green-600"}`} />
              {isLoading ? (
                <div className="text-xl text-gray-400">Scanning…</div>
              ) : score === null ? (
                <>
                  <div className="text-2xl font-bold text-gray-400">Unavailable</div>
                  <div className="text-sm text-gray-500 mt-2">Security score could not be computed</div>
                </>
              ) : (
                <>
                  <div className={`text-6xl font-black ${gradeColor}`}>{grade}</div>
                  <div className="text-3xl font-bold text-gray-800 mt-1">{score}/100</div>
                  <div className="text-sm text-green-700 mt-2 font-medium">Security Score</div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-600 mb-2"><XCircle className="w-4 h-4" /><span className="font-medium text-sm">Failing Checks</span></div>
              <div className={`text-3xl font-bold ${failed.length > 0 ? "text-red-600" : "text-green-600"}`}>{data ? failed.length : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Checks currently not passing</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-600 mb-2"><CheckCircle className="w-4 h-4" /><span className="font-medium text-sm">Passing Checks</span></div>
              <div className="text-3xl font-bold text-green-600">{data ? passed.length : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Out of {checks.length} computed checks</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-2"><Eye className="w-4 h-4" /><span className="font-medium text-sm">Coverage</span></div>
              <div className="text-3xl font-bold text-gray-800">{data ? checks.length : "—"}</div>
              <div className="text-xs text-gray-500 mt-1">Security checks evaluated server-side</div>
            </CardContent>
          </Card>
        </div>

        {/* Real computed checks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />Security Checks ({data ? `${passed.length}/${checks.length} passing` : "unavailable"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : checks.length === 0 ? (
              <p className="text-center py-8 text-gray-400">No check data available.</p>
            ) : (
              <div className="space-y-3">
                {checks.map((c: any) => (
                  <div key={c.name} className={`flex items-start gap-3 p-3 border rounded-lg ${c.passed ? "" : "border-red-300 bg-red-50"}`}>
                    {c.passed
                      ? <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      : <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.name}</span>
                        <Badge className={`text-xs ${c.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{c.passed ? "Passing" : "Failing"}</Badge>
                        <span className="text-xs text-gray-400">weight {c.weight}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{c.detail}</p>
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
