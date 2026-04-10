import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, AlertTriangle, Plus, Unlock } from "lucide-react";
export default function EscrowV2() {
  const escrows = [
    { id: "e1", description: "Website Development", amount: 500000, buyer: "TechCorp Ltd", status: "funded", milestones: 3 },
    { id: "e2", description: "Product Supply", amount: 1200000, buyer: "Retail Chain NG", status: "partially_released", milestones: 2 },
    { id: "e3", description: "Consulting Services", amount: 300000, buyer: "StartupXYZ", status: "disputed", milestones: 1 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Escrow V2</h1><p className="text-muted-foreground">Secure milestone-based payment escrow</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Create Escrow</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Shield className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">20M</p><p className="text-sm text-muted-foreground">Total in Escrow</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Lock className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Active Escrows</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Disputes</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Active Escrows</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{escrows.map(e => (
          <div key={e.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{e.description}</p><p className="text-sm text-muted-foreground">Buyer: {e.buyer} - {e.milestones} milestones</p></div>
            <div className="flex items-center gap-3">
              <p className="font-bold">{(e.amount/100).toLocaleString()}</p>
              <Badge variant={e.status==="disputed"?"destructive":e.status==="funded"?"default":"secondary"}>{e.status.replace("_"," ")}</Badge>
              <Button size="sm" variant="outline"><Unlock className="w-4 h-4 mr-1" />Release</Button>
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
