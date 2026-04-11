import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Gem, Zap } from "lucide-react";

export default function NFTBadges() {
  const [mintForm, setMintForm] = useState({ collectionId: "", customerId: "", tier: "bronze" });
  const { data: collections } = trpc.tier6to8.nftBadges.getCollections.useQuery();
  const mintMutation = trpc.tier6to8.nftBadges.mintBadge.useMutation({
    onSuccess: (d: any) => toast.success(`Badge minted — Token #${d.tokenId}`),
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Gem className="w-8 h-8 text-purple-600" />
        <div><h1 className="text-2xl font-bold">NFT Loyalty Badges</h1><p className="text-muted-foreground">Create collections and mint loyalty badges on-chain</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {collections?.collections.map(c => (
          <Card key={c.id} className="border-2 border-purple-100">
            <CardHeader>
              <img src={c.imageUrl} alt={c.name} className="w-full h-32 object-cover rounded-md mb-2" onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/300x128?text=NFT"; }} />
              <CardTitle className="text-base">{c.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Symbol</span><span className="font-mono">{c.symbol}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Minted</span><span>{c.totalMinted} / {c.maxSupply}</span></div>
              <div className="w-full bg-secondary rounded-full h-2"><div className="bg-purple-600 h-2 rounded-full" style={{ width: `${(c.totalMinted / c.maxSupply) * 100}%` }} /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" />Mint Badge</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className="border rounded-md px-3 py-2 text-sm" value={mintForm.collectionId} onChange={e => setMintForm(f => ({ ...f, collectionId: e.target.value }))}>
            <option value="">Select Collection</option>
            {collections?.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input placeholder="Customer ID" value={mintForm.customerId} onChange={e => setMintForm(f => ({ ...f, customerId: e.target.value }))} />
          <select className="border rounded-md px-3 py-2 text-sm" value={mintForm.tier} onChange={e => setMintForm(f => ({ ...f, tier: e.target.value }))}>
            <option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="platinum">Platinum</option>
          </select>
          <Button onClick={() => mintMutation.mutate(mintForm)} disabled={mintMutation.isPending || !mintForm.collectionId || !mintForm.customerId}>
            {mintMutation.isPending ? "Minting..." : "Mint Badge"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
