import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Smartphone, Wifi, CheckCircle, Plus } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

export default function NfcPay() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState({ deviceName: "", deviceType: "nfc_reader" });

  const { data, isLoading, refetch } = trpc5.nfcPay.listDevices.useQuery();
  const { data: stats } = trpc5.nfcPay.getStats.useQuery();
  const { data: txData } = trpc5.nfcPay.listTransactions.useQuery({});

  const register = trpc5.nfcPay.registerDevice.useMutation({
    onSuccess: () => { toast.success("Device registered"); setRegisterOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const devices = data?.devices ?? [];
  const txs = txData?.transactions ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">NFC Tap-to-Pay</h1><p className="text-muted-foreground">Manage NFC devices and contactless transactions</p></div>
        <Button onClick={() => setRegisterOpen(true)}><Plus className="w-4 h-4 mr-2" />Register Device</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Smartphone className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.totalDevices ?? 0}</p><p className="text-sm text-muted-foreground">Total Devices</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wifi className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.activeDevices ?? 0}</p><p className="text-sm text-muted-foreground">Active</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{stats?.totalTransactions ?? 0}</p><p className="text-sm text-muted-foreground">Transactions</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Devices</CardTitle></CardHeader><CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
          devices.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No devices registered yet.</p></div> : (
            <div className="space-y-3">{devices.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div><p className="font-medium">{d.deviceName}</p><p className="text-sm text-muted-foreground font-mono">{d.deviceId}</p></div>
                <Badge variant={d.status === "active" ? "default" : "secondary"}>{d.status}</Badge>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader><CardContent>
          {txs.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No transactions yet.</p></div> : (
            <div className="space-y-3">{txs.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div><p className="font-medium">&#8358;{(t.amount / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p></div>
                <Badge variant={t.status === "approved" ? "default" : "destructive"}>{t.status}</Badge>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      </div>
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register NFC Device</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Device Name</Label><Input value={form.deviceName} onChange={e => setForm(p => ({ ...p, deviceName: e.target.value }))} placeholder="e.g. Main Counter" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button onClick={() => register.mutate({ deviceName: form.deviceName, deviceType: form.deviceType })} disabled={register.isPending}>{register.isPending ? "Registering..." : "Register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
