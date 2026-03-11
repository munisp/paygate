import { useState } from "react";
import { Key, Copy, Eye, EyeOff, RefreshCw, Plus, Trash2, Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const KEYS = [
  { id: "key_1", name: "Production Secret Key", type: "secret", env: "live", key: "sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", created: "Jan 15, 2026", lastUsed: "2 min ago", requests: 142847 },
  { id: "key_2", name: "Production Public Key", type: "public", env: "live", key: "pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", created: "Jan 15, 2026", lastUsed: "5 min ago", requests: 89234 },
  { id: "key_3", name: "Test Secret Key", type: "secret", env: "test", key: "sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", created: "Jan 10, 2026", lastUsed: "1 hr ago", requests: 3421 },
  { id: "key_4", name: "Test Public Key", type: "public", env: "test", key: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", created: "Jan 10, 2026", lastUsed: "1 hr ago", requests: 2891 },
];

export default function APIKeys() {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [env, setEnv] = useState<"live" | "test">("live");

  const toggleReveal = (id: string) => {
    if (!revealed[id]) {
      toast.warning("Key revealed — keep this secret!");
    }
    setRevealed((p) => ({ ...p, [id]: !p[id] }));
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  const filtered = KEYS.filter((k) => k.env === env);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>API Keys</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your API credentials and access tokens</p>
        </div>
        <Button size="sm" onClick={() => toast.success("New API key generated!")}>
          <Plus className="w-4 h-4 mr-2" />
          Generate New Key
        </Button>
      </div>

      {/* Security Warning */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Keep your secret keys secure</p>
          <p className="text-xs text-amber-700 mt-0.5">Never expose secret keys in client-side code, public repositories, or browser-accessible files. Rotate keys immediately if compromised.</p>
        </div>
      </div>

      {/* Environment Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex bg-muted rounded-lg p-1 gap-1">
          {(["live", "test"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${env === e ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {e === "live" ? "🟢 Live" : "🧪 Test"}
            </button>
          ))}
        </div>
        {env === "live" && <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">Live environment — real transactions</Badge>}
        {env === "test" && <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Test environment — no real charges</Badge>}
      </div>

      {/* Keys */}
      <div className="space-y-4">
        {filtered.map((key) => (
          <div key={key.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${key.type === "secret" ? "bg-red-50" : "bg-blue-50"}`}>
                  {key.type === "secret" ? <Shield className={`w-5 h-5 text-red-600`} /> : <Key className="w-5 h-5 text-blue-600" />}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{key.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {key.created} · Last used {key.lastUsed} · {key.requests.toLocaleString()} requests
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-xs ${key.type === "secret" ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                  {key.type}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-muted rounded-lg border border-border font-mono text-sm overflow-hidden">
                <span className="truncate text-foreground">
                  {revealed[key.id] ? key.key : key.key.replace(/x/g, "•").slice(0, 40) + "..."}
                </span>
              </div>
              <button onClick={() => toggleReveal(key.id)} className="p-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
                {revealed[key.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => copyKey(key.key)} className="p-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
                <Copy className="w-4 h-4" />
              </button>
              <button onClick={() => toast.success(`${key.name} rotated successfully`)} className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-600 flex-shrink-0">
                <RefreshCw className="w-4 h-4" />
              </button>
              {key.type === "secret" && (
                <button onClick={() => toast.error("Key revoked")} className="p-2.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-red-600 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Usage Stats */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>API Usage This Month</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: "232,081", cls: "text-foreground" },
            { label: "Success Rate", value: "99.94%", cls: "text-emerald-600" },
            { label: "Avg Latency", value: "42ms", cls: "text-indigo-600" },
            { label: "Rate Limit Hits", value: "12", cls: "text-amber-600" },
          ].map((s) => (
            <div key={s.label} className="text-center p-4 rounded-xl bg-muted/50">
              <p className={`text-xl font-bold amount ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
