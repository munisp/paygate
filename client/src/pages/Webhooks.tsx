import { useState } from "react";
import { Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ENDPOINTS = [
  { id: "wh_1", url: "https://api.acmecorp.com/webhooks/paygate", events: ["charge.success", "charge.failed", "transfer.success"], status: "active", successRate: 99.2, lastDelivery: "2 min ago" },
  { id: "wh_2", url: "https://staging.acmecorp.com/webhooks/paygate", events: ["charge.success"], status: "active", successRate: 97.8, lastDelivery: "15 min ago" },
  { id: "wh_3", url: "https://legacy.acmecorp.com/payments/notify", events: ["charge.success", "charge.failed"], status: "disabled", successRate: 82.1, lastDelivery: "3 days ago" },
];

const LOGS = Array.from({ length: 20 }, (_, i) => ({
  id: `evt_${Math.random().toString(36).slice(2, 10)}`,
  event: ["charge.success", "charge.failed", "transfer.success", "refund.created"][i % 4],
  endpoint: ENDPOINTS[i % 2].url,
  status: i % 7 === 0 ? "failed" : "delivered",
  statusCode: i % 7 === 0 ? 500 : 200,
  duration: `${Math.floor(Math.random() * 300) + 50}ms`,
  time: `${Math.floor(i * 3.5)} min ago`,
}));

const ALL_EVENTS = ["charge.success", "charge.failed", "charge.pending", "transfer.success", "transfer.failed", "refund.created", "dispute.created", "customer.created", "subscription.created", "subscription.cancelled"];

export default function Webhooks() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ url: "", events: [] as string[] });
  const [activeTab, setActiveTab] = useState<"endpoints" | "logs">("endpoints");

  const toggleEvent = (evt: string) => {
    setForm((p) => ({
      ...p,
      events: p.events.includes(evt) ? p.events.filter((e) => e !== evt) : [...p.events, evt],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url || form.events.length === 0) {
      toast.error("Please provide a URL and select at least one event");
      return;
    }
    toast.success(`Webhook endpoint added: ${form.url}`);
    setShowForm(false);
    setForm({ url: "", events: [] });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Webhooks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Receive real-time event notifications</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Endpoint
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(["endpoints", "logs"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-all ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {tab === "endpoints" ? "Endpoints" : "Delivery Logs"}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Add Webhook Endpoint</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Endpoint URL</label>
              <input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required placeholder="https://your-server.com/webhooks" className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Events to Listen For</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ALL_EVENTS.map((evt) => (
                  <label key={evt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${form.events.includes(evt) ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}>
                    <input type="checkbox" checked={form.events.includes(evt)} onChange={() => toggleEvent(evt)} className="sr-only" />
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${form.events.includes(evt) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                      {form.events.includes(evt) && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="font-mono text-xs">{evt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit">Add Endpoint</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "endpoints" && (
        <div className="space-y-4">
          {ENDPOINTS.map((ep) => (
            <div key={ep.id} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50">
                    <Globe className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{ep.url}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Last delivery: {ep.lastDelivery} · {ep.successRate}% success rate</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${ep.status === "active" ? "status-success border-0" : "bg-muted text-muted-foreground"}`}>{ep.status}</Badge>
                  <button onClick={() => toast.success("Test event sent!")} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Zap className="w-4 h-4" />
                  </button>
                  <button onClick={() => toast.error("Endpoint deleted")} className="p-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ep.events.map((evt) => (
                  <span key={evt} className="px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-muted-foreground">{evt}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-border bg-muted/30">
              {["Event ID", "Event Type", "Endpoint", "Status", "Duration", "Time"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {LOGS.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toast.info(`Viewing log ${log.id}`)}>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{log.id}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-muted text-xs font-mono">{log.event}</span></td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground truncate max-w-[200px]">{log.endpoint.replace("https://", "")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${log.status === "delivered" ? "status-success" : "status-failed"}`}>
                      {log.status === "delivered" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {log.statusCode} {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground amount">{log.duration}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
