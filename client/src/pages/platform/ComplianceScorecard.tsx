import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2, XCircle, AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 90 ? "text-green-500" : score >= 70 ? "text-yellow-500" : "text-destructive";
  const ringColor = score >= 90 ? "stroke-green-500" : score >= 70 ? "stroke-yellow-500" : "stroke-destructive";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
        <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`${ringColor} transition-all duration-1000`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export default function ComplianceScorecard() {
  const { data: scorecard, refetch, isLoading } = trpc.wave221.compliance.getScorecard.useQuery();
  const { data: checks } = trpc.wave221.compliance.getChecks.useQuery();

  const overallScore = scorecard?.overallScore ?? 0;
  const categories = scorecard?.categories ?? [];
  const allChecks = checks ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compliance Scorecard</h1>
          <p className="text-muted-foreground text-sm">AML, KYC, PCI-DSS, ISO 27001, and NDPR compliance posture</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col items-center justify-center py-6">
          <p className="text-sm font-medium text-muted-foreground mb-3">Overall Compliance Score</p>
          <ScoreGauge score={overallScore} />
          <Badge variant={overallScore >= 90 ? "default" : overallScore >= 70 ? "secondary" : "destructive"} className="mt-3">
            {overallScore >= 90 ? "Compliant" : overallScore >= 70 ? "Needs Attention" : "Non-Compliant"}
          </Badge>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {categories.map((cat, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className={`text-lg font-bold ${cat.score >= 90 ? "text-green-600" : cat.score >= 70 ? "text-yellow-600" : "text-destructive"}`}>{cat.score}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${cat.score >= 90 ? "bg-green-500" : cat.score >= 70 ? "bg-yellow-500" : "bg-destructive"}`} style={{ width: `${cat.score}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{cat.passedChecks}/{cat.totalChecks} checks passed</p>
              </CardContent>
            </Card>
          ))}
          {categories.length === 0 && (
            <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">No compliance categories configured</div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compliance Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allChecks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No compliance checks configured</p>
            )}
            {allChecks.map((check, i) => (
              <div key={i} className={`flex items-start justify-between p-3 rounded-lg border ${check.status === "pass" ? "border-green-500/20 bg-green-500/5" : check.status === "fail" ? "border-destructive/20 bg-destructive/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
                <div className="flex items-start gap-3">
                  {check.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : check.status === "fail" ? <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-muted-foreground">{check.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">{check.framework}</Badge>
                  <Badge variant={check.status === "pass" ? "default" : check.status === "fail" ? "destructive" : "secondary"} className="text-xs capitalize">{check.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
