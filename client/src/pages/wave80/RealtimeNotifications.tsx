import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, Smartphone, Send } from "lucide-react";
export default function RealtimeNotifications() {
  const [tab, setTab] = useState("preferences");
  const [channels, setChannels] = useState({ email: true, sms: false, push: true, inApp: true });
  const history = [
    { id: "n1", channel: "email", event: "payment.completed", status: "delivered", sentAt: "2026-04-09T22:30:00Z" },
    { id: "n2", channel: "push", event: "payout.initiated", status: "delivered", sentAt: "2026-04-09T21:15:00Z" },
    { id: "n3", channel: "sms", event: "dispute.opened", status: "failed", sentAt: "2026-04-09T20:00:00Z" },
  ];
  const iconMap: Record<string,any> = { email: Mail, sms: MessageSquare, push: Smartphone, inApp: Bell };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Real-Time Notifications</h1><p className="text-muted-foreground">Multi-channel notification hub</p></div>
        <Button><Send className="w-4 h-4 mr-2" />Test Notification</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bell className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">1,245</p><p className="text-sm text-muted-foreground">Sent (7d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Mail className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">98.2%</p><p className="text-sm text-muted-foreground">Delivery Rate</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><MessageSquare className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">22</p><p className="text-sm text-muted-foreground">Failed (7d)</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="preferences">Preferences</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
        <TabsContent value="preferences">
          <Card><CardHeader><CardTitle>Channel Preferences</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">{Object.entries(channels).map(([ch,enabled])=>{
              const Icon = iconMap[ch]||Bell;
              return (
                <div key={ch} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3"><Icon className="w-5 h-5 text-muted-foreground" /><Label className="capitalize">{ch}</Label></div>
                  <Switch checked={enabled} onCheckedChange={v=>setChannels(prev=>({...prev,[ch]:v}))} />
                </div>
              );
            })}</div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="history">
          <Card><CardHeader><CardTitle>Notification History</CardTitle></CardHeader><CardContent>
            <div className="space-y-3">{history.map(n=>{
              const Icon = iconMap[n.channel]||Bell;
              return (
                <div key={n.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3"><Icon className="w-5 h-5 text-muted-foreground" /><div><p className="font-medium">{n.event}</p><p className="text-sm text-muted-foreground">{new Date(n.sentAt).toLocaleString()}</p></div></div>
                  <Badge variant={n.status==="delivered"?"default":"destructive"}>{n.status}</Badge>
                </div>
              );
            })}</div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
