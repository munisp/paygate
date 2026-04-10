import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, Webhook, Smartphone, Send } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

const iconMap: Record<string, React.ElementType> = {
  webhook: Webhook, email: Mail, sms: MessageSquare, push: Smartphone, "in-app": Bell,
};

export default function RealtimeNotifications() {
  const [tab, setTab] = useState("preferences");

  const { data: prefsData, refetch: refetchPrefs } = trpc5.realtimeNotifications.getPreferences.useQuery();
  const { data: historyData, isLoading: loadingHistory } = trpc5.realtimeNotifications.getNotificationHistory.useQuery({});
  const { data: statsData } = trpc5.realtimeNotifications.getDeliveryStats.useQuery({});

  const updatePrefs = trpc5.realtimeNotifications.updatePreferences.useMutation({
    onSuccess: () => { toast.success("Preferences saved"); refetchPrefs(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const testNotification = trpc5.realtimeNotifications.testNotification.useMutation({
    onSuccess: () => toast.success("Test notification sent"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const prefs = prefsData?.preferences;
  const history = historyData?.notifications ?? [];

  const channelMap: Record<string, boolean> = {
    webhook: !!prefs?.webhookEnabled,
    email: !!prefs?.emailEnabled,
    sms: !!prefs?.smsEnabled,
    push: !!prefs?.pushEnabled,
    "in-app": !!prefs?.inAppEnabled,
  };

  const handleChannelToggle = (channel: string, enabled: boolean) => {
    const updates: Record<string, boolean> = {};
    if (channel === "in-app") updates.inAppEnabled = enabled;
    else updates[channel + "Enabled"] = enabled;
    updatePrefs.mutate(updates);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Real-Time Notifications</h1><p className="text-muted-foreground">Manage notification channels and delivery preferences</p></div>
        <Button variant="outline" onClick={() => testNotification.mutate({ channel: "in-app", message: "Test notification from PayGate" })}><Send className="w-4 h-4 mr-2" />Send Test</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Bell className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{statsData?.sent ?? 0}</p><p className="text-sm text-muted-foreground">Sent (7d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Send className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{statsData?.deliveryRate ?? 0}%</p><p className="text-sm text-muted-foreground">Delivery Rate</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><MessageSquare className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{statsData?.failed ?? 0}</p><p className="text-sm text-muted-foreground">Failed (7d)</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="preferences">Preferences</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
        <TabsContent value="preferences">
          <Card><CardHeader><CardTitle>Channel Preferences</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">{Object.entries(channelMap).map(([ch, enabled]) => {
              const Icon = iconMap[ch] || Bell;
              return (
                <div key={ch} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3"><Icon className="w-5 h-5 text-muted-foreground" /><Label className="capitalize">{ch}</Label></div>
                  <Switch checked={enabled} onCheckedChange={v => handleChannelToggle(ch, v)} />
                </div>
              );
            })}</div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="history">
          <Card><CardHeader><CardTitle>Notification History</CardTitle></CardHeader><CardContent>
            {loadingHistory ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            history.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No notifications yet.</p></div> : (
              <div className="space-y-3">{history.map(n => {
                const Icon = iconMap[n.channel] || Bell;
                return (
                  <div key={n.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3"><Icon className="w-5 h-5 text-muted-foreground" /><div><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p></div></div>
                    <Badge variant={n.status === "delivered" ? "default" : "destructive"}>{n.status}</Badge>
                  </div>
                );
              })}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
