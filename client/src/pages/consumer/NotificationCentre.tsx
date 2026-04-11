import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, BellOff, Check, CheckCheck, CreditCard, ArrowUpDown, Receipt, Shield, Gift } from "lucide-react";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ReactNode> = {
  wallet_credit: <CreditCard className="h-5 w-5 text-green-500" />,
  wallet_debit: <CreditCard className="h-5 w-5 text-red-500" />,
  transfer: <ArrowUpDown className="h-5 w-5 text-blue-500" />,
  bill_payment: <Receipt className="h-5 w-5 text-purple-500" />,
  kyc: <Shield className="h-5 w-5 text-yellow-500" />,
  reward: <Gift className="h-5 w-5 text-pink-500" />,
};

export default function NotificationCentre() {
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, refetch } = trpc.notifications.list.useQuery({ limit: 100 });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => refetch() });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { refetch(); toast.success("All notifications marked as read"); } });

  const notifications = (Array.isArray(data) ? data : (data as any)?.notifications ?? data ?? []).filter((n: any) =>
    filter === "all" ? true : !n.readAt
  );
  const unreadCount = (Array.isArray(data) ? data : (data as any)?.notifications ?? data ?? []).filter((n: any) => !n.readAt).length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Stay updated on your wallet activity and account events
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v: any) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unreadCount > 0 && (
              <Badge className="ml-2 h-5 min-w-5 text-xs" variant="destructive">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">No notifications</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {filter === "unread" ? "You're all caught up!" : "Your notifications will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <Card
              key={n.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${!n.readAt ? "border-primary/30 bg-primary/5" : ""}`}
              onClick={() => { if (!n.readAt) markRead.mutate({ id: n.id }); }}
            >
              <CardContent className="flex items-start gap-4 py-4">
                <div className="mt-0.5 flex-shrink-0">
                  {ICON_MAP[n.type] ?? <Bell className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium leading-tight ${!n.readAt ? "text-foreground" : "text-muted-foreground"}`}>
                      {n.title}
                    </p>
                    {!n.readAt && (
                      <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                    )}
                  </div>
                  {n.content && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.content}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {n.readAt && (
                  <Check className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
