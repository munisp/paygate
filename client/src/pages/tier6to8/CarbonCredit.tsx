import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Leaf, Award, BarChart3 } from "lucide-react";

export default function CarbonCredit() {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [purchaseForm, setPurchaseForm] = useState({ listingId: "", tonnes: 1, retirementPurpose: "Scope 1 emissions offset" });
  const { isLoading, data: listings } = trpc.tier6to8.carbonCredit.getListings.useQuery({}, { staleTime: 30_000 });
  const { data: certificates } = trpc.tier6to8.carbonCredit.getMyCertificates.useQuery();
  const { data: report } = trpc.tier6to8.carbonCredit.getEmissionsReport.useQuery({ year: selectedYear }, { staleTime: 30_000 });
  const purchaseMutation = trpc.tier6to8.carbonCredit.purchaseCredits.useMutation({
    onSuccess: (d: any) => { toast.success(`${d.tonnes} tonne(s) retired — Certificate: ${d.certificateId}`); },
    onError: (e: any) => toast.error(e.message),
  });

  const scoreColor = report?.score === "A" ? "text-green-600" : report?.score === "B" ? "text-yellow-600" : "text-red-600";

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Leaf className="w-8 h-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Carbon Credit Marketplace</h1>
          <p className="text-muted-foreground">Purchase and retire verified carbon credits</p>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Total Emissions</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{report.totalEmissionsTonnes.toFixed(1)}t</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Offset</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{report.offsetTonnes.toFixed(1)}t</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Net Emissions</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{report.netEmissions.toFixed(1)}t</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">ESG Score</CardTitle></CardHeader><CardContent><p className={`text-3xl font-bold ${scoreColor}`}>{report.score}</p></CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Available Projects</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {listings?.listings.map(l => (
              <div key={l.id} className="p-3 border rounded-lg space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{l.projectName}</p>
                    <p className="text-sm text-muted-foreground">{l.country} — {l.creditType}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">${l.pricePerTonneUSD}/tonne</p>
                    <Badge variant={l.verified ? "default" : "secondary"}>{l.verified ? "Verified" : "Pending"}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{l.availableCredits.toLocaleString()} credits available</p>
                <div className="flex gap-2">
                  <Input type="number" min={1} max={l.availableCredits} placeholder="Tonnes" className="w-24"
                    onChange={e => setPurchaseForm(f => ({ ...f, listingId: l.id, tonnes: parseInt(e.target.value) || 1 }))} />
                  <Button size="sm" onClick={() => purchaseMutation.mutate({ ...purchaseForm, listingId: l.id })} disabled={purchaseMutation.isPending}>
                    Purchase & Retire
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Award className="w-4 h-4" />My Certificates</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {certificates?.certificates.map(c => (
                <div key={c.id} className="p-3 border rounded-lg">
                  <p className="font-medium text-sm">{c.projectName}</p>
                  <p className="text-xs text-muted-foreground">{c.tonnes} tonnes — Retired {new Date(c.retiredAt).toLocaleDateString()}</p>
                  <a href={c.registryUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View Registry →</a>
                </div>
              ))}
              {!certificates?.certificates.length && <p className="text-center text-muted-foreground py-8">No certificates yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
