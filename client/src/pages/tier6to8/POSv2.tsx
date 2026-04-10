import { useState } from "react";
import { trpc3 } from "@/lib/trpc3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Monitor, Wifi, WifiOff, RefreshCw, Plus, MapPin } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function POSv2() {
  const { user } = useAuth();
  const [serialNumber, setSerialNumber] = useState("");
  const [terminalModel, setTerminalModel] = useState("Ingenico_iWL250");
  const [location, setLocation] = useState("");

  const terminalsQuery = trpc3.posTerminalV2.getTerminals.useQuery(undefined, { enabled: !!user });

  const provisionMutation = trpc3.posTerminalV2.provisionTerminal.useMutation({
    onSuccess: (data) => {
      toast("Terminal provisioned", { description: `Terminal ID: ${data.terminalId}` });
      terminalsQuery.refetch();
      setSerialNumber("");
      setLocation("");
    },
    onError: (e: any) => toast("Provisioning failed", { description: e.message }),
  });

  const terminals = (terminalsQuery.data as any)?.terminals ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">POS Terminals v2</h1>
          <p className="text-muted-foreground">Manage next-gen POS terminals with offline mode and contactless payments</p>
        </div>
        <Button onClick={() => terminalsQuery.refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Monitor, color: "text-blue-500", label: "Total Terminals", value: terminals.length },
          { icon: Wifi, color: "text-green-500", label: "Online", value: terminals.filter((t: any) => t.status === "online").length },
          { icon: WifiOff, color: "text-orange-500", label: "Offline", value: terminals.filter((t: any) => t.status === "offline").length },
          { icon: MapPin, color: "text-purple-500", label: "Locations", value: new Set(terminals.map((t: any) => t.location)).size },
        ].map(({ icon: Icon, color, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Provision Terminal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Provision New Terminal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Serial Number</label>
              <Input placeholder="e.g. ING-2024-001234" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Terminal Model</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={terminalModel}
                onChange={(e) => setTerminalModel(e.target.value)}
              >
                <option value="Ingenico_iWL250">Ingenico iWL250</option>
                <option value="Verifone_VX520">Verifone VX520</option>
                <option value="PAX_A920">PAX A920</option>
                <option value="Sunmi_P2">Sunmi P2</option>
                <option value="Morefun_MP200">Morefun MP200</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Location</label>
              <Input placeholder="e.g. Lagos Island Branch" value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button
            onClick={() => provisionMutation.mutate({ serialNumber, model: terminalModel, location })}
            disabled={!serialNumber || !location || provisionMutation.isPending}
          >
            {provisionMutation.isPending ? "Provisioning..." : "Provision Terminal"}
          </Button>
        </CardContent>
      </Card>

      {/* Terminal List */}
      <Card>
        <CardHeader>
          <CardTitle>Terminal Fleet</CardTitle>
        </CardHeader>
        <CardContent>
          {terminalsQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading terminals...</p>
          ) : terminals.length === 0 ? (
            <div className="text-center py-12">
              <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No terminals provisioned yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Terminal ID</th>
                    <th className="text-left py-2 px-3">Model</th>
                    <th className="text-left py-2 px-3">Location</th>
                    <th className="text-right py-2 px-3">Volume (30d)</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-center py-2 px-3">Offline Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((t: any) => (
                    <tr key={t.terminalId} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs">{t.terminalId}</td>
                      <td className="py-2 px-3">{t.model}</td>
                      <td className="py-2 px-3 text-muted-foreground">{t.location}</td>
                      <td className="py-2 px-3 text-right font-mono">₦{((t.volumeKobo30d ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={t.status === "online" ? "default" : t.status === "offline" ? "secondary" : "destructive"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={t.offlineModeEnabled ? "default" : "outline"}>
                          {t.offlineModeEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
