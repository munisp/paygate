import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, Play, Shield, AlertTriangle, TrendingUp, Edit, ChevronDown, ChevronUp } from "lucide-react";

const FIELDS = [
  { value: "amount", label: "Transaction Amount (₦)" },
  { value: "currency", label: "Currency" },
  { value: "country", label: "Country Code" },
  { value: "card_bin", label: "Card BIN" },
  { value: "customer_email", label: "Customer Email" },
  { value: "channel", label: "Payment Channel" },
  { value: "velocity_1h", label: "Velocity (1h)" },
  { value: "velocity_24h", label: "Velocity (24h)" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater than or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less than or equal" },
  { value: "in", label: "in list" },
  { value: "not_in", label: "not in list" },
  { value: "contains", label: "contains" },
];

const ACTION_TYPES = [
  { value: "block", label: "Block Transaction", color: "destructive" },
  { value: "flag", label: "Flag for Review", color: "warning" },
  { value: "notify", label: "Send Notification", color: "default" },
  { value: "require_3ds", label: "Require 3DS", color: "secondary" },
  { value: "step_up_auth", label: "Step-Up Auth", color: "secondary" },
  { value: "throttle", label: "Throttle", color: "outline" },
];

interface Condition {
  id: string;
  field: string;
  op: string;
  value: string | number;
}

interface ConditionGroup {
  operator: "AND" | "OR";
  conditions: Condition[];
}

function ConditionBuilder({
  group,
  onChange,
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
}) {
  const addCondition = () => {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { id: crypto.randomUUID(), field: "amount", op: "gt", value: 0 },
      ],
    });
  };

  const updateCondition = (idx: number, updates: Partial<Condition>) => {
    const newConditions = [...group.conditions];
    newConditions[idx] = { ...newConditions[idx], ...updates };
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (idx: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Match</span>
        <div className="flex gap-1">
          {(["AND", "OR"] as const).map((op) => (
            <Button
              key={op}
              size="sm"
              variant={group.operator === op ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => onChange({ ...group, operator: op })}
            >
              {op}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">of the following conditions:</span>
      </div>

      {group.conditions.map((cond, idx) => (
        <div key={cond.id} className="flex items-center gap-2 flex-wrap">
          <Select value={cond.field} onValueChange={(v) => updateCondition(idx, { field: v })}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={cond.op} onValueChange={(v) => updateCondition(idx, { op: v })}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-36 h-8 text-xs"
            value={String(cond.value)}
            onChange={(e) => {
              const v = e.target.value;
              updateCondition(idx, { value: isNaN(Number(v)) ? v : Number(v) });
            }}
            placeholder="Value"
          />

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            aria-label="Delete" onClick={() => removeCondition(idx)}
          ><Trash2/>
          </Button>
        </div>
      ))}

      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCondition}>
        <Plus className="h-3 w-3 mr-1" /> Add Condition
      </Button>
    </div>
  );
}

function SimulateModal({
  ruleId,
  ruleName,
  open,
  onClose,
}: {
  ruleId: string;
  ruleName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("50000");
  const [currency, setCurrency] = useState("NGN");
  const [country, setCountry] = useState("NG");
  const [channel, setChannel] = useState("card");
  const [result, setResult] = useState<any>(null);

  const simulate = trpc.fraudRuleEngine.simulate.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulate Rule: {ruleName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (kobo)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {result && (
            <div
              className={`rounded-lg p-3 text-sm ${
                result.triggered ? "bg-destructive/10 border border-destructive/30" : "bg-green-500/10 border border-green-500/30"
              }`}
            >
              <div className="font-semibold mb-1">
                {result.triggered ? "🚨 Rule TRIGGERED" : "✅ Rule NOT triggered"}
              </div>
              {result.triggered && result.actions.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Actions: {result.actions.map((a: any) => a.type).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} size="sm">
            Close
          </Button>
          <Button
            size="sm"
            onClick={() =>
              simulate.mutate({
                ruleId,
                testTransaction: {
                  amount: Number(amount),
                  currency,
                  country,
                  channel,
                },
              })
            }
            disabled={simulate.isPending}
          >
            <Play className="h-3 w-3 mr-1" />
            {simulate.isPending ? "Running..." : "Run Simulation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FraudRuleEngine() {
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [simulateRule, setSimulateRule] = useState<{ id: string; name: string } | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [conditionGroup, setConditionGroup] = useState<ConditionGroup>({
    operator: "AND",
    conditions: [{ id: crypto.randomUUID(), field: "amount", op: "gt", value: 100000 }],
  });
  const [actions, setActions] = useState<Array<{ type: string }>>([{ type: "flag" }]);

  const utils = trpc.useUtils();

  const { data: rules, isLoading } = trpc.fraudRuleEngine.list.useQuery({
    status: "all",
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.fraudRuleEngine.getStats.useQuery(undefined, { staleTime: 30_000 });

  const createRule = trpc.fraudRuleEngine.create.useMutation({
    onSuccess: () => {
      toast.success("Fraud rule created");
      utils.fraudRuleEngine.list.invalidate();
      utils.fraudRuleEngine.getStats.invalidate();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleStatus = trpc.fraudRuleEngine.toggleStatus.useMutation({
    onSuccess: () => {
      toast.success("Rule status updated");
      utils.fraudRuleEngine.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRule = trpc.fraudRuleEngine.delete.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted");
      utils.fraudRuleEngine.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setPriority("100");
    setStatus("draft");
    setConditionGroup({ operator: "AND", conditions: [{ id: crypto.randomUUID(), field: "amount", op: "gt", value: 100000 }] });
    setActions([{ type: "flag" }]);
  };

  const handleCreate = () => {
    if (!name.trim()) { toast.error("Rule name is required"); return; }
    if (conditionGroup.conditions.length === 0) { toast.error("Add at least one condition"); return; }
    if (actions.length === 0) { toast.error("Add at least one action"); return; }
    createRule.mutate({
      name: name.trim(),
      description: description || undefined,
      conditionTree: conditionGroup as any,
      actions: actions as any,
      priority: Number(priority),
      status,
    });
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-500/10 text-green-700 border-green-500/30",
    paused: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
    draft: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-destructive" />
            Fraud Rule Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build condition-based rules to block, flag, or throttle suspicious transactions
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Rules", value: stats?.total ?? 0, icon: Shield },
          { label: "Active", value: stats?.active ?? 0, icon: TrendingUp, color: "text-green-600" },
          { label: "Paused", value: stats?.paused ?? 0, icon: AlertTriangle, color: "text-yellow-600" },
          { label: "Total Hits", value: (stats?.totalHits ?? 0).toLocaleString(), icon: Play },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-8 w-8 ${color ?? "text-muted-foreground"}`} />
              <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules ({rules?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading rules...</div>
          ) : !rules?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No fraud rules yet</p>
              <p className="text-xs mt-1">Create your first rule to start protecting transactions</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.status === "active"}
                      onCheckedChange={(checked) =>
                        toggleStatus.mutate({ id: rule.id, status: checked ? "active" : "paused" })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <div className="font-medium text-sm">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-muted-foreground">{rule.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs border ${statusColor[rule.status]}`}>
                      {rule.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">P{rule.priority}</span>
                    <span className="text-xs text-muted-foreground">{rule.hitCount ?? 0} hits</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); setSimulateRule({ id: rule.id, name: rule.name }); }}
                    >
                      <Play className="h-3 w-3 mr-1" /> Test
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteRule.mutate({ id: rule.id }); }}
                    ><Trash2/>
                    </Button>
                    {expandedRule === rule.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {expandedRule === rule.id && (
                  <div className="border-t p-3 bg-muted/20 space-y-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">CONDITIONS</div>
                      <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-32">
                        {JSON.stringify(rule.conditionTree, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">ACTIONS</div>
                      <div className="flex gap-2 flex-wrap">
                        {(rule.actions as any[]).map((a: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {a.type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create Rule Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Fraud Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Rule Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Block high-value international transactions"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this rule does..."
                  className="mt-1 h-16 resize-none text-sm"
                />
              </div>
              <div>
                <Label>Priority (1=highest)</Label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  min="1"
                  max="1000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Initial Status</Label>
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-semibold">Conditions</Label>
              <div className="mt-2">
                <ConditionBuilder group={conditionGroup} onChange={setConditionGroup} />
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Actions</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setActions([...actions, { type: "flag" }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Action
                </Button>
              </div>
              <div className="space-y-2">
                {actions.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={action.type}
                      onValueChange={(v) => {
                        const newActions = [...actions];
                        newActions[idx] = { type: v };
                        setActions(newActions);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((a) => (
                          <SelectItem key={a.value} value={a.value} className="text-xs">
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label="Delete" onClick={() => setActions(actions.filter((_, i) => i !== idx))}
                    ><Trash2/>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createRule.isPending}>
              {createRule.isPending ? "Creating..." : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simulate Modal */}
      {simulateRule && (
        <SimulateModal
          ruleId={simulateRule.id}
          ruleName={simulateRule.name}
          open={!!simulateRule}
          onClose={() => setSimulateRule(null)}
        />
      )}
    </div>
  );
}
