import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Wifi, Plus, Activity } from "lucide-react";
export default function NfcPay() {
  const devices = [
    { id: "d1", name: "POS Terminal 001", deviceId: "NFC-001", status: "active", taps: 245, lastUsed: "2026-04-09" },
    { id: "d2", name: "Mobile POS Cashier 2", deviceId: "NFC-002", status: "active", taps: 189, lastUsed: "2026-04-09" },
    { id: "d3", name: "Kiosk Terminal", deviceId: "NFC-003", status: "inactive", taps: 0, lastUsed: "Never" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">NFC Tap-to-Pay</h1><p className="text-muted-foreground">Provision devices and accept contactless payments</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Provision Device</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Smartphone className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Provisioned Devices</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wifi className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">434</p><p className="text-sm text-muted-foreground">Total Taps (30d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Activity className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">99.1%</p><p className="text-sm text-muted-foreground">Success Rate</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>NFC Devices</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{devices.map(d => (
          <div key={d.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3"><Smartphone className="w-5 h-5 text-muted-foreground" /><div><p className="font-medium">{d.name}</p><p className="text-sm text-muted-foreground">ID: {d.deviceId} - Last: {d.lastUsed}</p></div></div>
            <div className="flex items-center gap-3"><p className="font-medium">{d.taps} taps</p><Badge variant={d.status==="active"?"default":"secondary"}>{d.status}</Badge><Button size="sm" variant="outline">Configure</Button></div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
