import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, CheckCircle } from "lucide-react";

const MSG_TYPES = ["pacs.008", "pacs.009", "camt.053", "camt.054", "pain.001", "pain.002"];

export default function ISO20022() {
  const [msgType, setMsgType] = useState("pacs.008");
  const [targetBIC, setTargetBIC] = useState("GTBINGLA");
  const [payload, setPayload] = useState("");
  const { isLoading, data: messages, refetch } = trpc.tier6to8.iso20022.getMessages.useQuery({ direction: "all", limit: 20 });
  const sendMutation = trpc.tier6to8.iso20022.sendMessage.useMutation({
    onSuccess: (d: any) => { toast.success(`Message sent — MsgId: ${d.messageId}`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const ackMutation = trpc.tier6to8.iso20022.acknowledgeMessage.useMutation({
    onSuccess: () => { toast.success("Message acknowledged"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "acknowledged" ? "default" : s === "rejected" ? "destructive" : "secondary";

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-8 h-8 text-indigo-600" />
        <div><h1 className="text-2xl font-bold">ISO 20022 Message Bus</h1><p className="text-muted-foreground">Send and receive ISO 20022 financial messages via SWIFT/CBN</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Send Message</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Message Type</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={msgType} onChange={e => setMsgType(e.target.value)}>
                {MSG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target BIC</label>
              <input className="w-full border rounded-md px-3 py-2 text-sm font-mono" value={targetBIC} onChange={e => setTargetBIC(e.target.value)} placeholder="GTBINGLA" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">XML Payload</label>
              <textarea className="w-full border rounded-md px-3 py-2 text-xs font-mono h-32" value={payload} onChange={e => setPayload(e.target.value)} placeholder="<Document>...</Document>" />
            </div>
            <Button className="w-full" disabled={sendMutation.isPending || !targetBIC}
              onClick={() => sendMutation.mutate({ messageType: msgType as any, payload: { xml: payload || "<Document/>" }, targetBIC, priority: "NORM" })}>
              {sendMutation.isPending ? "Sending..." : "Send ISO 20022 Message"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Message Inbox/Outbox</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages?.messages.map((m: any) => (
                <div key={m.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-sm font-medium">{m.messageType}</p>
                      <p className="text-xs text-muted-foreground">{m.direction === "inbound" ? "From" : "To"}: {m.counterpartyBIC}</p>
                      <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusColor(m.status)}>{m.status}</Badge>
                      {m.direction === "inbound" && m.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => ackMutation.mutate({ messageId: m.id, ackCode: "ACCP" })}>
                          <CheckCircle className="w-3 h-3 mr-1" />ACK
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!messages?.messages.length && <p className="text-center text-muted-foreground py-8">No messages yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
