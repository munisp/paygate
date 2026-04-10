import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, FileText, Send, AlertTriangle, TrendingUp } from "lucide-react";
export default function RegulatoryReporting() {
  const reports = [
    { id: "r1", type: "CBN Monthly Return", period: "March 2026", status: "submitted", reference: "CBN-2026-03-001" },
    { id: "r2", type: "AML Suspicious Activity", period: "Q1 2026", status: "generated", reference: null },
    { id: "r3", type: "NDIC Premium Return", period: "March 2026", status: "pending", reference: null },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Regulatory Reporting</h1><p className="text-muted-foreground">CBN, SEC, NDIC, and AML compliance reports</p></div>
        <Button><FileText className="w-4 h-4 mr-2" />Generate Report</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">85</p><p className="text-sm text-muted-foreground">Compliance Score</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Shield className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Submitted</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Ready to Submit</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Regulatory Reports</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{reports.map(r => (
          <div key={r.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{r.type}</p><p className="text-sm text-muted-foreground">{r.period}{r.reference?" - Ref: "+r.reference:""}</p></div>
            <div className="flex items-center gap-3">
              <Badge variant={r.status==="submitted"?"default":r.status==="generated"?"secondary":"outline"}>{r.status}</Badge>
              {r.status==="generated" && <Button size="sm"><Send className="w-4 h-4 mr-1" />Submit</Button>}
              {r.status==="pending" && <Button size="sm" variant="outline">Generate</Button>}
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
