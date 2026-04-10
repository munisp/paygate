import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Calendar, Upload } from "lucide-react";
export default function TaxFiling() {
  const deadlines = [
    { type: "VAT Return", period: "March 2026", dueDate: "2026-04-21", status: "filed", amount: 450000 },
    { type: "WHT Return", period: "March 2026", dueDate: "2026-04-21", status: "pending", amount: 125000 },
    { type: "CIT Estimate", period: "Q1 2026", dueDate: "2026-04-30", status: "not_due", amount: 0 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Tax Filing Integration</h1><p className="text-muted-foreground">FIRS e-filing, VAT, WHT, and CIT management</p></div>
        <Button><Upload className="w-4 h-4 mr-2" />File Return</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Filed This Month</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Pending Returns</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Calendar className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">Apr 21</p><p className="text-sm text-muted-foreground">Next Deadline</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Tax Calendar</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{deadlines.map((d,i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{d.type} - {d.period}</p><p className="text-sm text-muted-foreground">Due: {d.dueDate}</p></div>
            <div className="flex items-center gap-3">
              {d.amount>0 && <p className="font-medium">{(d.amount/100).toLocaleString()}</p>}
              <Badge variant={d.status==="filed"?"default":d.status==="pending"?"destructive":"secondary"}>{d.status.replace("_"," ")}</Badge>
              {d.status==="pending" && <Button size="sm">File Now</Button>}
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
