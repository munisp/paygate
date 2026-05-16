/**
 * SuperAgentManagement.tsx
 *
 * Super Agent V2 management — manage agent networks, sub-agents, sessions,
 * and messaging for the PayGate super-agent banking model.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Users, Plus, MessageSquare, Activity, RefreshCw, AlertCircle, UserX, UserCheck } from "lucide-react";

export default function SuperAgentManagement() {
  const [networkPage, setNetworkPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const limit = 20;
  const [addOpen, setAddOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [msgText, setMsgText] = useState("");

  const { data: networks, isLoading: networksLoading, isError: networksError, refetch: refetchNetworks } =
    trpc.superAgentV2Mgmt.listNetworks.useQuery({ limit, offset: networkPage * limit }, { staleTime: 30_000 });

  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } =
    trpc.superAgentV2Mgmt.listSessions.useQuery({ limit, offset: sessionPage * limit }, { staleTime: 30_000 });

  const addSubAgent = trpc.superAgentV2Mgmt.addSubAgent.useMutation({
    onSuccess: () => {
      toast.success("Sub-agent added successfully");
      setAddOpen(false);
      setAgentName(""); setAgentPhone(""); setAgentEmail("");
      refetchNetworks();
    },
    onError: (err) => toast.error(err.message),
  });

  const suspend = trpc.superAgentV2Mgmt.suspend.useMutation({
    onSuccess: () => { toast.success("Agent suspended"); refetchNetworks(); },
    onError: (err) => toast.error(err.message),
  });

  const reactivate = trpc.superAgentV2Mgmt.reactivate.useMutation({
    onSuccess: () => { toast.success("Agent reactivated"); refetchNetworks(); },
    onError: (err) => toast.error(err.message),
  });

  const sendMessage = trpc.superAgentV2Mgmt.sendMessage.useMutation({
    onSuccess: () => { toast.success("Message sent"); setMsgOpen(false); setMsgText(""); },
    onError: (err) => toast.error(err.message),
  });

  const statusColor = (s: string) => {
    if (s === "active") return "bg-green-100 text-green-800";
    if (s === "suspended") return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-800";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" /> Super Agent Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage agent networks, sub-agents, and live sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => { refetchNetworks(); refetchSessions(); }}><RefreshCw/> Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Sub-Agent
          </Button>
        </div>
      </div>

      {(networksError || sessionsError) && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load data. Please refresh.
        </div>
      )}

      <Tabs defaultValue="networks">
        <TabsList>
          <TabsTrigger value="networks">Agent Networks</TabsTrigger>
          <TabsTrigger value="sessions">Live Sessions</TabsTrigger>
        </TabsList>

        {/* Networks Tab */}
        <TabsContent value="networks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> Sub-Agent Network
              </CardTitle>
            </CardHeader>
            <CardContent>
              {networksLoading ? (
                <div className="text-muted-foreground text-sm py-8 text-center">Loading agents…</div>
              ) : !networks?.agents?.length ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No sub-agents yet.</p>
                  <Button className="mt-4" onClick={() => setAddOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add First Sub-Agent
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs uppercase">
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-left py-2 px-3">Phone</th>
                        <th className="text-right py-2 px-3">Transactions</th>
                        <th className="text-center py-2 px-3">Status</th>
                        <th className="text-right py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networks.agents.map((agent: any) => (
                        <tr key={agent.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium">{agent.name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{agent.phone ?? "—"}</td>
                          <td className="py-2 px-3 text-right">{agent.transactionCount ?? 0}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge className={statusColor(agent.status)}>{agent.status}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {agent.status === "active" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => suspend.mutate({ id: agent.id, reason: "Manual suspension" })}
                                  disabled={suspend.isPending}
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => reactivate.mutate({ id: agent.id })}
                                  disabled={reactivate.isPending}
                                >
                                  <UserCheck className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between mt-4">
                    <Button variant="outline" size="sm" disabled={networkPage === 0} onClick={() => setNetworkPage(p => p - 1)}>Previous</Button>
                    <span className="text-xs text-muted-foreground">Page {networkPage + 1}</span>
                    <Button variant="outline" size="sm" disabled={!networks?.hasMore} onClick={() => setNetworkPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" /> Live Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="text-muted-foreground text-sm py-8 text-center">Loading sessions…</div>
              ) : !sessions?.sessions?.length ? (
                <div className="text-center py-8">
                  <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No active sessions</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs uppercase">
                        <th className="text-left py-2 px-3">Session ID</th>
                        <th className="text-left py-2 px-3">Agent</th>
                        <th className="text-left py-2 px-3">Started</th>
                        <th className="text-center py-2 px-3">Status</th>
                        <th className="text-right py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.sessions.map((session: any) => (
                        <tr key={session.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-mono text-xs">{session.id.slice(0, 12)}…</td>
                          <td className="py-2 px-3">{session.agentName ?? session.agentId ?? "—"}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {session.startedAt ? new Date(session.startedAt).toLocaleString() : "—"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge className={statusColor(session.status ?? "active")}>{session.status ?? "active"}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedSession(session.id); setMsgOpen(true); }}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between mt-4">
                    <Button variant="outline" size="sm" disabled={sessionPage === 0} onClick={() => setSessionPage(p => p - 1)}>Previous</Button>
                    <span className="text-xs text-muted-foreground">Page {sessionPage + 1}</span>
                    <Button variant="outline" size="sm" disabled={!sessions?.hasMore} onClick={() => setSessionPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Sub-Agent Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sub-Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input placeholder="Agent name" value={agentName} onChange={e => setAgentName(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input placeholder="+234..." value={agentPhone} onChange={e => setAgentPhone(e.target.value)} />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" placeholder="agent@example.com" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!agentName.trim()) { toast.error("Name is required"); return; }
                addSubAgent.mutate({ name: agentName, phone: agentPhone, email: agentEmail || undefined });
              }}
              disabled={addSubAgent.isPending}
            >
              {addSubAgent.isPending ? "Adding…" : "Add Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Message</Label>
              <Input
                placeholder="Type your message…"
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!msgText.trim() || !selectedSession) return;
                sendMessage.mutate({ sessionId: selectedSession, message: msgText });
              }}
              disabled={sendMessage.isPending}
            >
              {sendMessage.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
