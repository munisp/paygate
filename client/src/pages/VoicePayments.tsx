import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function VoicePayments() {
  const [serialNumber, setSerialNumber] = useState("");
  const [model, setModel] = useState<"SB-1" | "SB-2" | "SB-Pro" | "SB-Mini">("SB-1");
  const [location, setLocation] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "yo" | "ig" | "ha" | "pcm">("en");
  const [volume, setVolume] = useState("80");

  const {isLoading, data: devices, refetch} = trpc.newFeatures.voicePayments.getSoundboxDevices.useQuery();
  const { data: alerts } = trpc.newFeatures.voicePayments.getPaymentAlerts.useQuery(
    { deviceId: selectedDevice ?? "" },
    { enabled: !!selectedDevice }
  );
  const { data: stats } = trpc.newFeatures.voicePayments.getDeviceStats.useQuery(
    { deviceId: selectedDevice ?? "" },
    { enabled: !!selectedDevice }
  );

  const registerMutation = trpc.newFeatures.voicePayments.registerDevice.useMutation({
    onSuccess: (d: any) => { toast.success(`Device registered: ${d.activationCode}`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const configureMutation = trpc.newFeatures.voicePayments.configureAudio.useMutation({
    onSuccess: () => toast.success("Audio configured"),
    onError: (e: any) => toast.error(e.message),
  });
  const testMutation = trpc.newFeatures.voicePayments.testAudio.useMutation({
    onSuccess: () => toast.success("Test audio sent to device"),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const statusColor = (s: string) => ({ online: "bg-green-100 text-green-700", offline: "bg-red-100 text-red-700", idle: "bg-yellow-100 text-yellow-700" }[s] ?? "bg-gray-100 text-gray-700");

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Voice Payments / Soundbox</h1>
        <Badge variant="outline" className="text-blue-600 border-blue-600">🔊 Audio Alerts</Badge>
      </div>

      {/* Device List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {devices?.devices?.map(d => (
          <Card key={d.deviceId} className={`cursor-pointer transition-all ${selectedDevice === d.deviceId ? "ring-2 ring-primary" : ""}`}
            onClick={() => setSelectedDevice(d.deviceId)}>
            <CardContent className="pt-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold">{d.model}</p>
                  <p className="text-xs text-muted-foreground font-mono">{d.serialNumber}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(d.status)}`}>{d.status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{d.location}</p>
              <div className="flex justify-between text-xs mt-2">
                <span>Battery: {d.batteryLevel}%</span>
                <span>FW: {d.firmwareVersion}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                <div className={`h-1.5 rounded-full ${d.batteryLevel > 50 ? "bg-green-500" : d.batteryLevel > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${d.batteryLevel}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
        {!devices?.devices?.length && <p className="text-muted-foreground text-sm col-span-3">No soundbox devices registered</p>}
      </div>

      {/* Register Device */}
      <Card>
        <CardHeader><CardTitle className="text-base">Register New Soundbox</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Serial Number</label><Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="SB-XXXXXX" /></div>
            <div><label className="text-xs text-muted-foreground">Model</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={model} onChange={e => setModel(e.target.value as any)}>
                {["SB-1", "SB-2", "SB-Pro", "SB-Mini"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground">Location</label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Counter" /></div>
          </div>
          <Button disabled={registerMutation.isPending}
            onClick={() => registerMutation.mutate({ serialNumber, model, location })}>
            {registerMutation.isPending ? "Registering..." : "Register Device"}
          </Button>
        </CardContent>
      </Card>

      {/* Configure Audio */}
      {selectedDevice && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Audio Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Language</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={language} onChange={e => setLanguage(e.target.value as any)}>
                  <option value="en">English</option>
                  <option value="yo">Yoruba</option>
                  <option value="ig">Igbo</option>
                  <option value="ha">Hausa</option>
                  <option value="pcm">Pidgin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Volume: {volume}%</label>
                <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(e.target.value)} className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={configureMutation.isPending}
                  onClick={() => configureMutation.mutate({ deviceId: selectedDevice, language, volume: parseInt(volume) })}>
                  {configureMutation.isPending ? "Saving..." : "Save Config"}
                </Button>
                <Button variant="outline" disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate({ deviceId: selectedDevice, message: "Test payment received" })}>
                  {testMutation.isPending ? "Testing..." : "Test Audio"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader><CardTitle className="text-base">Device Statistics</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Total Alerts</p><p className="text-xl font-bold">{stats.totalAlerts}</p></div>
                <div><p className="text-xs text-muted-foreground">Success Rate</p><p className="text-xl font-bold text-green-600">{stats.totalAlerts > 0 ? ((stats.successfulAlerts / stats.totalAlerts) * 100).toFixed(0) : 0}%</p></div>
                <div><p className="text-xs text-muted-foreground">Avg Response</p><p className="text-xl font-bold">{stats.avgResponseMs}ms</p></div>
                <div><p className="text-xs text-muted-foreground">Uptime</p><p className="text-xl font-bold">{stats.uptime?.toFixed(1)}%</p></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Payment Alerts */}
      {selectedDevice && (
        <Card>
          <CardHeader><CardTitle>Recent Payment Alerts</CardTitle></CardHeader>
          <CardContent>
            {!alerts?.alerts?.length ? <p className="text-muted-foreground text-sm">No alerts yet</p> :
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2">Sender</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Channel</th><th className="text-right py-2">Audio</th><th className="text-right py-2">Time</th></tr></thead>
                <tbody>
                  {alerts.alerts.map(a => (
                    <tr key={a.alertId} className="border-b hover:bg-muted/30">
                      <td className="py-2">{a.senderName}</td>
                      <td className="text-right font-semibold text-green-600">{formatKobo(a.amountKobo)}</td>
                      <td className="text-right">{a.channel}</td>
                      <td className="text-right"><Badge variant={a.audioPlayed ? "default" : "secondary"}>{a.audioPlayed ? "Played" : "Pending"}</Badge></td>
                      <td className="text-right text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}
    </div>
  );
}
