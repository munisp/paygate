import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, DollarSign, Clock, CheckCircle, Plus } from "lucide-react";
export default function InvoiceFinancingV2() {
  const invoices = [
    { id: "i1", buyer: "Dangote Group", amount: 2500000, dueDate: "2026-05-15", status: "approved", advance: 2000000 },
    { id: "i2", buyer: "MTN Nigeria", amount: 1800000, dueDate: "2026-06-01", status: "under_review", advance: 0 },
    { id: "i3", buyer: "Access Bank", amount: 950000, dueDate: "2026-04-30", status: "repaid", advance: 760000 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Invoice Financing V2</h1><p className="text-muted-foreground">Get advances on outstanding invoices</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Submit Invoice</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Total Invoices</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">27.6M</p><p className="text-sm text-muted-foreground">Total Financed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">20M</p><p className="text-sm text-muted-foreground">Outstanding</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">80%</p><p className="text-sm text-muted-foreground">Avg Advance Rate</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Invoice Applications</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{invoices.map(inv => (
          <div key={inv.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{inv.buyer}</p><p className="text-sm text-muted-foreground">Due: {inv.dueDate}</p></div>
            <div className="flex items-center gap-3">
              {inv.advance>0 && <p className="text-sm text-green-600 font-medium">Advance: {(inv.advance/100).toLocaleString()}</p>}
              <Badge variant={inv.status==="approved"?"default":inv.status==="repaid"?"secondary":"outline"}>{inv.status.replace("_"," ")}</Badge>
              {inv.status==="approved" && <Button size="sm" variant="outline">Repay</Button>}
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
