import { useState } from "react";
import { trpc3 } from "@/lib/trpc3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, DollarSign, TrendingUp, RefreshCw, UserPlus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function AgentNetwork() {
  const { user } = useAuth();
  const [showOnboard, setShowOnboard] = useState(false);
  const [form, setForm] = useState({ agentName: "", phoneNumber: "", bvn: "", nin: "", address: "", lga: "", state: "", terminalType: "POS" as "POS" | "mobile" | "kiosk", cashFloatLimitKobo: 500000 });

  const networkQuery = trpc3.agentBankingV2.getAgentNetwork.useQuery(undefined, { enabled: !!user });

  const onboardMutation = trpc3.agentBankingV2.onboardAgent.useMutation({
    onSuccess: (data) => {
      toast("Agent onboarded", { description: `Agent code: ${data.agentCode}` });
      networkQuery.refetch();
      setShowOnboard(false);
    },
    onError: (e) => toast("Onboarding failed", { description: e.message }),
  });

  const data = networkQuery.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Banking Network</h1>
          <p className="text-muted-foreground">Manage agents, float balances, and commissions</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => networkQuery.refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => setShowOnboard(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" /> Onboard Agent
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Agents</p>
                <p className="text-2xl font-bold">{data?.totalAgents ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <p className="text-2xl font-bold">{data?.activeAgents ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Txns Today</p>
                <p className="text-2xl font-bold">{data?.totalTransactionsToday ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Volume Today</p>
                <p className="text-2xl font-bold">₦{((data?.totalVolumeKoboToday ?? 0) / 100).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Onboard Agent Form */}
      {showOnboard && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Onboard New Agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "agentName", label: "Agent Name", placeholder: "John Doe" },
                { key: "phoneNumber", label: "Phone Number", placeholder: "+2348012345678" },
                { key: "bvn", label: "BVN", placeholder: "22345678901" },
                { key: "nin", label: "NIN", placeholder: "12345678901" },
                { key: "address", label: "Address", placeholder: "123 Main Street" },
                { key: "lga", label: "LGA", placeholder: "Ikeja" },
                { key: "state", label: "State", placeholder: "Lagos" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-sm font-medium">{label}</label>
                  <Input
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              ))}
              <div>
                <label className="text-sm font-medium">Terminal Type</label>
                <select
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.terminalType}
                  onChange={(e) => setForm(f => ({ ...f, terminalType: e.target.value as "POS" | "mobile" | "kiosk" }))}
                >
                  <option value="POS">POS</option>
                  <option value="mobile">Mobile</option>
                  <option value="kiosk">Kiosk</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Cash Float Limit (Kobo)</label>
                <Input
                  type="number"
                  placeholder="500000"
                  value={form.cashFloatLimitKobo}
                  onChange={(e) => setForm(f => ({ ...f, cashFloatLimitKobo: parseInt(e.target.value) || 500000 }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onboardMutation.mutate(form)}
                disabled={onboardMutation.isPending}
              >
                {onboardMutation.isPending ? "Processing..." : "Onboard Agent"}
              </Button>
              <Button variant="outline" onClick={() => setShowOnboard(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suspended agents info */}
      {(data?.suspendedAgents ?? 0) > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">{data?.suspendedAgents}</Badge>
              <span className="text-sm">agents are currently suspended. Review them in the compliance dashboard.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
