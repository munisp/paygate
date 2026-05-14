import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Plus, Send, X, Loader2 } from "lucide-react";

export default function SupportChat() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [subject, setSubject] = useState("");

  const { data: sessionsData, isLoading } = trpc.supportChat.listSessions.useQuery({ page: 1 });
  const { data: sessionDetail } = trpc.supportChat.getSession.useQuery(
    { sessionId: selectedSession! },
    { enabled: !!selectedSession }
  );

  const startSession = trpc.supportChat.startSession.useMutation({
    onSuccess: (data) => {
      utils.supportChat.listSessions.invalidate();
      setStartOpen(false);
      setSubject("");
      setSelectedSession(data.sessionId ?? null);
      toast({ title: "Support session started" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendMessage = trpc.supportChat.sendMessage.useMutation({
    onSuccess: () => {
      utils.supportChat.getSession.invalidate({ sessionId: selectedSession! });
      setNewMessage("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeSession = trpc.supportChat.closeSession.useMutation({
    onSuccess: () => {
      utils.supportChat.listSessions.invalidate();
      setSelectedSession(null);
      toast({ title: "Session closed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sessions = sessionsData?.sessions ?? [];
  const messages = sessionDetail?.messages ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="w-6 h-6" /> Support Chat</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage merchant support sessions</p>
        </div>
        <Dialog open={startOpen} onOpenChange={setStartOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Session</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Start Support Session</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Subject</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Describe your issue..." /></div>
              <Button className="w-full" disabled={startSession.isPending} onClick={() => startSession.mutate({ initialMessage: subject })}>
                {startSession.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Start Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
        {/* Sessions list */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sessions</CardTitle></CardHeader>
          <ScrollArea className="h-[520px]">
            <CardContent className="pt-0 space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sessions yet</p>
              ) : sessions.map((s: any) => (
                <button
                  key={s.id}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedSession === s.id ? "bg-primary/10 border-primary" : "hover:bg-muted"}`}
                  onClick={() => setSelectedSession(s.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{s.subject ?? "Support Request"}</span>
                    <Badge variant={s.status === "open" ? "default" : "secondary"} className="text-xs">{s.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                </button>
              ))}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Chat window */}
        <Card className="md:col-span-2 overflow-hidden flex flex-col">
          {!selectedSession ? (
            <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a session to view messages
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm">{"Support Session"}</CardTitle>
                <Button size="sm" variant="destructive" onClick={() => closeSession.mutate({ sessionId: selectedSession! })}>
                  <X className="w-3.5 h-3.5 mr-1" />Close
                </Button>
              </CardHeader>
              <ScrollArea className="flex-1 px-4">
                <div className="space-y-3 pb-4">
                  {messages.map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === "merchant" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${msg.role === "merchant" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.content}
                        <p className="text-xs opacity-60 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-4 border-t flex gap-2">
                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={e => { if (e.key === "Enter" && newMessage.trim()) sendMessage.mutate({ sessionId: selectedSession, content: newMessage }); }}
                />
                <Button disabled={!newMessage.trim() || sendMessage.isPending} onClick={() => sendMessage.mutate({ sessionId: selectedSession, content: newMessage })}>
                  {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
