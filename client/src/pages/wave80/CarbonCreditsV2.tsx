import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, TrendingUp, Award, ShoppingCart } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

const PROJECTS = [
  { name: "Mangrove Restoration — Delta State", type: "reforestation", country: "NG", standard: "VCS", price: 12.5, available: 5000 },
  { name: "Solar Cookstoves — Kano", type: "renewable_energy", country: "NG", standard: "Gold Standard", price: 18.0, available: 2000 },
  { name: "Reforestation — Ondo", type: "reforestation", country: "NG", standard: "VCS", price: 10.0, available: 8000 },
];

export default function CarbonCreditsV2() {
  const [tab, setTab] = useState("portfolio");
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<typeof PROJECTS[0] | null>(null);
  const [qty, setQty] = useState("1");

  const { data: creditsData, isLoading, refetch } = trpc5.carbonCreditsV2.listCredits.useQuery({});
  const { data: stats } = trpc5.carbonCreditsV2.getStats.useQuery();

  const purchase = trpc5.carbonCreditsV2.purchaseCredits.useMutation({
    onSuccess: () => { toast.success("Credits purchased"); setBuyOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const retire = trpc5.carbonCreditsV2.retireCredits.useMutation({
    onSuccess: () => { toast.success("Credits retired"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const credits = creditsData?.credits ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Carbon Credits V2</h1><p className="text-muted-foreground">Purchase and retire verified carbon credits</p></div>
        <Button onClick={() => { setTab("marketplace"); }}><ShoppingCart className="w-4 h-4 mr-2" />Buy Credits</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Leaf className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.totalOwned ?? 0}t</p><p className="text-sm text-muted-foreground">CO₂ Offset Owned</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">${(stats?.totalSpent ?? 0).toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Spent</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Award className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{stats?.totalRetired ?? 0}t</p><p className="text-sm text-muted-foreground">Retired</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="portfolio">Portfolio</TabsTrigger><TabsTrigger value="marketplace">Marketplace</TabsTrigger></TabsList>
        <TabsContent value="portfolio">
          <Card><CardHeader><CardTitle>My Holdings</CardTitle></CardHeader><CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            credits.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No holdings yet. Purchase credits from the marketplace.</p></div> : (
              <div className="space-y-3">{credits.map(c => (
                <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div><p className="font-medium">{c.projectName}</p><p className="text-sm text-muted-foreground">{c.certificationBody} · {c.quantity}t · ${c.pricePerTonne}/t</p></div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                    {c.status === "active" && <Button size="sm" variant="outline" onClick={() => retire.mutate({ creditId: c.id, quantity: c.quantity })}>Retire</Button>}
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="marketplace">
          <Card><CardHeader><CardTitle>Available Projects</CardTitle></CardHeader><CardContent>
            <div className="space-y-3">{PROJECTS.map(p => (
              <div key={p.name} className="flex items-center justify-between p-4 border rounded-lg">
                <div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{p.standard} · {p.available.toLocaleString()} tonnes available</p></div>
                <div className="flex items-center gap-3"><p className="font-bold">${p.price}/t</p><Button size="sm" onClick={() => { setSelectedProject(p); setBuyOpen(true); }}>Buy</Button></div>
              </div>
            ))}</div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buy Carbon Credits</DialogTitle></DialogHeader>
          {selectedProject && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedProject.name}</p>
            <div className="space-y-2"><Label>Quantity (tonnes)</Label><Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <p className="font-medium">Total: ${(parseFloat(qty || "0") * selectedProject.price).toFixed(2)}</p>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedProject && purchase.mutate({ projectName: selectedProject.name, projectType: selectedProject.type, country: selectedProject.country, quantity: parseInt(qty), pricePerTonne: selectedProject.price, certificationBody: selectedProject.standard })} disabled={purchase.isPending}>{purchase.isPending ? "Buying..." : "Confirm Purchase"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
