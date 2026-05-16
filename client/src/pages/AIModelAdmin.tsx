import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Brain, Activity, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, Plus, Trash2, Play, Square } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  training: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const DECISION_COLORS: Record<string, string> = {
  APPROVE: "bg-green-100 text-green-800",
  REVIEW: "bg-yellow-100 text-yellow-800",
  BLOCK: "bg-red-100 text-red-800",
  FLAG: "bg-orange-100 text-orange-800",
};

export default function AIModelAdmin() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"models" | "audit" | "jobs">("models");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [newModel, setNewModel] = useState({
    name: "",
    modelType: "gnn_fraud" as const,
    version: "1.0.0",
    accuracy: "",
    f1Score: "",
    notes: "",
  });

  const statsQuery = trpc.aiModelAdmin.getModelStats.useQuery();
  const modelsQuery = trpc.aiModelAdmin.listModels.useQuery({
    status: statusFilter as any,
    limit: 50,
  }, { staleTime: 30_000 });
  const auditQuery = trpc.aiModelAdmin.listAuditTrail.useQuery({
    decision: decisionFilter as any,
    limit: 50,
  }, { staleTime: 30_000 });
  const jobsQuery = trpc.aiModelAdmin.listTrainingJobs.useQuery({ status: "all", limit: 20 }, { staleTime: 30_000 });

  const registerMutation = trpc.aiModelAdmin.registerModel.useMutation({
    onSuccess: () => {
      toast.success("Model registered successfully");
      modelsQuery.refetch();
      statsQuery.refetch();
      setRegisterOpen(false);
      setNewModel({ name: "", modelType: "gnn_fraud", version: "1.0.0", accuracy: "", f1Score: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.aiModelAdmin.updateModelStatus.useMutation({
    onSuccess: () => {
      toast.success("Model status updated");
      modelsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteModelMutation = trpc.aiModelAdmin.deleteModel.useMutation({
    onSuccess: () => {
      toast.success("Model deleted");
      modelsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelJobMutation = trpc.aiModelAdmin.cancelTrainingJob.useMutation({
    onSuccess: () => {
      toast.success("Job cancelled");
      jobsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI Model Administration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage fraud detection models, audit trails, and GNN training jobs
          </p>
        </div>
        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Register Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New AI Model</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Model Name</Label>
                <Input value={newModel.name} onChange={e => setNewModel(p => ({ ...p, name: e.target.value }))} placeholder="e.g. GNN Fraud Detector v3" />
              </div>
              <div>
                <Label>Model Type</Label>
                <Select value={newModel.modelType} onValueChange={v => setNewModel(p => ({ ...p, modelType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gnn_fraud">GNN Fraud Detection</SelectItem>
                    <SelectItem value="anomaly_detection">Anomaly Detection</SelectItem>
                    <SelectItem value="credit_scoring">Credit Scoring</SelectItem>
                    <SelectItem value="churn_prediction">Churn Prediction</SelectItem>
                    <SelectItem value="aml_detection">AML Detection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Version</Label>
                <Input value={newModel.version} onChange={e => setNewModel(p => ({ ...p, version: e.target.value }))} placeholder="1.0.0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Accuracy (0-1)</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={newModel.accuracy} onChange={e => setNewModel(p => ({ ...p, accuracy: e.target.value }))} placeholder="0.95" />
                </div>
                <div>
                  <Label>F1 Score (0-1)</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={newModel.f1Score} onChange={e => setNewModel(p => ({ ...p, f1Score: e.target.value }))} placeholder="0.93" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={newModel.notes} onChange={e => setNewModel(p => ({ ...p, notes: e.target.value }))} placeholder="Training notes..." />
              </div>
              <Button
                className="w-full"
                disabled={!newModel.name || !newModel.version || registerMutation.isPending}
                onClick={() => registerMutation.mutate({
                  name: newModel.name,
                  modelType: newModel.modelType,
                  version: newModel.version,
                  accuracy: newModel.accuracy ? parseFloat(newModel.accuracy) : undefined,
                  f1Score: newModel.f1Score ? parseFloat(newModel.f1Score) : undefined,
                  notes: newModel.notes || undefined,
                })}
              >
                {registerMutation.isPending ? "Registering..." : "Register Model"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{stats.activeModel?.name ?? "None"}</div>
              <div className="text-xs text-muted-foreground">Active Model</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalDecisions.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Decisions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.blockedCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Blocked ({stats.blockRate.toFixed(1)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">{stats.overriddenCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Overridden ({stats.overrideRate.toFixed(1)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.runningJobs}</div>
              <div className="text-xs text-muted-foreground">Running Jobs</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["models", "audit", "jobs"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "models" ? "Model Registry" : tab === "audit" ? "Audit Trail" : "Training Jobs"}
          </button>
        ))}
      </div>

      {/* Models Tab */}
      {activeTab === "models" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => modelsQuery.refetch()}>
              <RefreshCw className={`w-4 h-4 ${modelsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {modelsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading models...</div>
          ) : (
            <div className="space-y-3">
              {(modelsQuery.data?.models ?? []).map(model => (
                <Card key={model.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{model.name}</span>
                          <Badge variant="outline" className="text-xs">{model.version}</Badge>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[model.status] ?? ""}`}>
                            {model.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">{model.modelType}</div>
                        {model.accuracy && (
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>Accuracy: <strong>{(model.accuracy * 100).toFixed(1)}%</strong></span>
                            {model.f1Score && <span>F1: <strong>{(model.f1Score * 100).toFixed(1)}%</strong></span>}
                            {model.aucRoc && <span>AUC-ROC: <strong>{(model.aucRoc * 100).toFixed(1)}%</strong></span>}
                          </div>
                        )}
                        {model.notes && <div className="text-xs text-muted-foreground">{model.notes}</div>}
                      </div>
                      <div className="flex gap-2">
                        {model.status === "training" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300"
                            onClick={() => updateStatusMutation.mutate({ id: model.id, status: "active" })}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Activate
                          </Button>
                        )}
                        {model.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-gray-600"
                            onClick={() => updateStatusMutation.mutate({ id: model.id, status: "archived" })}
                          >
                            Archive
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          aria-label="Delete" onClick={() => {
                            if (confirm("Delete this model?")) deleteModelMutation.mutate({ id: model.id });
                          }}
                        ><Trash2/>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(modelsQuery.data?.models ?? []).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No models found. Register your first model above.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Tab */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Select value={decisionFilter} onValueChange={setDecisionFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="APPROVE">Approved</SelectItem>
                <SelectItem value="REVIEW">Review</SelectItem>
                <SelectItem value="BLOCK">Blocked</SelectItem>
                <SelectItem value="FLAG">Flagged</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => auditQuery.refetch()}>
              <RefreshCw className={`w-4 h-4 ${auditQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Transaction</th>
                  <th className="pb-2 pr-4">Decision</th>
                  <th className="pb-2 pr-4">Risk Score</th>
                  <th className="pb-2 pr-4">Merchant</th>
                  <th className="pb-2 pr-4">Overridden By</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {(auditQuery.data?.entries ?? []).map(entry => (
                  <tr key={entry.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{entry.transactionId ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DECISION_COLORS[entry.decision] ?? ""}`}>
                        {entry.decision}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {entry.riskScore != null ? (
                        <span className={`font-semibold ${entry.riskScore > 0.7 ? "text-red-600" : entry.riskScore > 0.4 ? "text-orange-600" : "text-green-600"}`}>
                          {(entry.riskScore * 100).toFixed(0)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">{entry.merchantId ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{entry.overriddenBy ?? "—"}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(auditQuery.data?.entries ?? []).length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No audit entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Training Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()}>
              <RefreshCw className={`w-4 h-4 mr-1 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {(jobsQuery.data ?? []).map(job => (
            <Card key={job.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{job.modelType}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] ?? ""}`}>
                        {job.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.epochs ? `Epoch ${job.currentEpoch ?? 0}/${job.epochs}` : ""}
                      {job.trainLoss ? ` · Loss: ${job.trainLoss.toFixed(4)}` : ""}
                    </div>
                    {job.errorMessage && (
                      <div className="text-xs text-red-600">{job.errorMessage}</div>
                    )}
                  </div>
                  {(job.status === "queued" || job.status === "running") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-500 border-red-300"
                      onClick={() => cancelJobMutation.mutate({ id: job.id })}
                    >
                      <Square className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(jobsQuery.data ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No training jobs found.</div>
          )}
        </div>
      )}
    </div>
  );
}
