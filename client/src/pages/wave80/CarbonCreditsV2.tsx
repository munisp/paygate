import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, TrendingUp, Award, ShoppingCart } from "lucide-react";

export default function CarbonCreditsV2() {
  const [tab, setTab] = useState("portfolio");
  const projects = [
    { id: "p1", name: "Mangrove Restoration — Delta State", standard: "VCS", price: 12.5, available: 5000 },
    { id: "p2", name: "Solar Cookstoves — Kano", standard: "Gold Standard", price: 18.0, available: 2000 },
    { id: "p3", name: "Reforestation — Ondo", standard: "VCS", price: 10.0, available: 8000 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carbon Credits V2</h1>
          <p className="text-muted-foreground">Purchase and retire verified carbon credits</p>
        </div>
        <Button><ShoppingCart className="w-4 h-4 mr-2" />Buy Credits</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Leaf className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">125t</p><p className="text-sm text-muted-foreground">CO₂ Offset</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">$1,562</p><p className="text-sm text-muted-foreground">Portfolio Value</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Award className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Certificates</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="portfolio">Portfolio</TabsTrigger><TabsTrigger value="marketplace">Marketplace</TabsTrigger></TabsList>
        <TabsContent value="marketplace">
          <Card><CardHeader><CardTitle>Available Projects</CardTitle></CardHeader><CardContent>
            <div className="space-y-3">{projects.map(p => (
              <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{p.standard} · {p.available.toLocaleString()} tonnes available</p></div>
                <div className="flex items-center gap-3"><p className="font-bold">${p.price}/t</p><Button size="sm">Buy</Button></div>
              </div>
            ))}</div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="portfolio"><Card><CardContent className="pt-6"><p className="text-center text-muted-foreground py-8">No holdings yet. Purchase credits from the marketplace.</p></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
