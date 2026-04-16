import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const priorityColors: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function AdminNotifications() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ title: "", message: "", targetType: "all_merchants" as any, priority: "normal" as any });
  const utils = trpc.useUtils();
  const broadcastsQuery = trpc.admin.notifications.listBroadcasts.useQuery({ limit: 20 });
  const broadcastMutation = trpc.admin.notifications.broadcast.useMutation({
    onSuccess: (data: any) => {
      utils.admin.notifications.listBroadcasts.invalidate();
      setForm({ title: "", message: "", targetType: "all_merchants", priority: "normal" });
      toast.success(`Broadcast sent to ${data?.recipientCount ?? 0} recipients`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const broadcasts = (broadcastsQuery.data as any[]) ?? [];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notification Center</h1>
          <p className="text-slate-400 text-sm mt-1">Broadcast notifications to merchants and users</p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/notifications/preferences")} className="border-slate-700 text-slate-300 hover:text-white">
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Alert Preferences
          </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Send className="w-4 h-4 text-blue-400" /> Send Broadcast</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300">Title</Label>
                <Input value={form.title} onChange={(e: any) => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="Notification title..." />
              </div>
              <div>
                <Label className="text-slate-300">Message</Label>
                <Textarea value={form.message} onChange={(e: any) => setForm(f => ({ ...f, message: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white" rows={4} placeholder="Notification message..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300">Target</Label>
                  <Select value={form.targetType} onValueChange={(v: any) => setForm(f => ({ ...f, targetType: v }))}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all_merchants">All Merchants</SelectItem>
                      <SelectItem value="specific_merchants">Specific Merchants</SelectItem>
                      <SelectItem value="all_users">All Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Priority</Label>
                  <Select value={form.priority} onValueChange={(v: any) => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={broadcastMutation.isPending || !form.title || !form.message}
                onClick={() => broadcastMutation.mutate(form)}>
                <Send className="w-4 h-4 mr-2" /> Send Broadcast
              </Button>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Recent Broadcasts</CardTitle></CardHeader>
            <CardContent className="p-0">
              {broadcastsQuery.isLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-slate-800" />)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Title</TableHead>
                      <TableHead className="text-slate-400">Priority</TableHead>
                      <TableHead className="text-slate-400">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts.map((b: any, i: number) => (
                      <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell>
                          <p className="text-white text-sm font-medium">{b.title}</p>
                          <p className="text-slate-400 text-xs truncate max-w-48">{b.message}</p>
                        </TableCell>
                        <TableCell><Badge className={`text-xs border ${priorityColors[b.priority] ?? "bg-slate-700 text-slate-300"}`}>{b.priority}</Badge></TableCell>
                        <TableCell className="text-slate-400 text-xs">{new Date(b.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      </TableRow>
                    ))}
                    {broadcasts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-8">No broadcasts yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
