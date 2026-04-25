// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Users, Key, RefreshCw, CheckCircle, XCircle, Settings, Globe, Lock, UserCheck } from "lucide-react";

const REALMS = [
  { name: "paygate-prod", displayName: "PayGate Production", users: 18420, clients: 12, status: "active", ssoEnabled: true, mfaRequired: true },
  { name: "paygate-staging", displayName: "PayGate Staging", users: 342, clients: 8, status: "active", ssoEnabled: true, mfaRequired: false },
  { name: "paygate-dev", displayName: "PayGate Development", users: 28, clients: 5, status: "active", ssoEnabled: false, mfaRequired: false },
];

const CLIENTS = [
  { clientId: "paygate-merchant-portal", name: "Merchant Portal", protocol: "openid-connect", status: "enabled", redirectUris: ["https://portal.paygate.ng/*"], secret: "••••••••••••" },
  { clientId: "paygate-mobile-sdk", name: "Mobile SDK", protocol: "openid-connect", status: "enabled", redirectUris: ["paygate://callback"], secret: "••••••••••••" },
  { clientId: "paygate-admin-cli", name: "Admin CLI", protocol: "openid-connect", status: "enabled", redirectUris: [], secret: "••••••••••••" },
  { clientId: "paygate-go-bridge", name: "Go Bridge Service", protocol: "openid-connect", status: "enabled", redirectUris: [], secret: "••••••••••••" },
  { clientId: "paygate-airflow", name: "Airflow Orchestrator", protocol: "openid-connect", status: "enabled", redirectUris: ["http://airflow:8080/*"], secret: "••••••••••••" },
];

const IDENTITY_PROVIDERS = [
  { alias: "google", displayName: "Google OAuth 2.0", enabled: true, firstBrokerLoginFlow: "first broker login", syncMode: "INHERIT" },
  { alias: "microsoft", displayName: "Microsoft Azure AD", enabled: true, firstBrokerLoginFlow: "first broker login", syncMode: "INHERIT" },
  { alias: "saml-enterprise", displayName: "Enterprise SAML 2.0", enabled: false, firstBrokerLoginFlow: "first broker login", syncMode: "FORCE" },
];

const REALM_ROLES = [
  { name: "merchant-owner", description: "Full merchant account access", composite: false, users: 18420 },
  { name: "merchant-admin", description: "Admin access without billing", composite: false, users: 4210 },
  { name: "merchant-developer", description: "API keys and webhooks only", composite: false, users: 8930 },
  { name: "merchant-viewer", description: "Read-only access", composite: false, users: 12840 },
  { name: "platform-admin", description: "PayGate platform superadmin", composite: true, users: 12 },
  { name: "compliance-officer", description: "KYC/AML/compliance access", composite: false, users: 48 },
];

export default function AdminKeycloak() {
  const [selectedRealm, setSelectedRealm] = useState("paygate-prod");
  const [activeTab, setActiveTab] = useState("overview");
  const [searchUser, setSearchUser] = useState("");
  const [syncUserId, setSyncUserId] = useState("");

  // Real tRPC data
  const { data: keycloakConfig } = trpc.settings.keycloak.isConfigured.useQuery();
  const syncRolesMutation = trpc.settings.keycloak.syncRoles.useMutation({
    onSuccess: (r) => toast.success(`Synced ${r.synced} role(s): ${(r.roles ?? []).join(", ") || "none"}${r.fallback ? " (bridge unavailable)" : ""}`),
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });
  const syncAllMutation = trpc.settings.keycloak.syncAllRoles.useMutation({
    onSuccess: (r) => toast.success(`Synced ${r.users} / ${r.total} users${r.fallback ? " (bridge unavailable)" : ""}`),
    onError: (e) => toast.error(`Bulk sync failed: ${e.message}`),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Keycloak SSO Administration</h1>
          <p className="text-muted-foreground text-sm mt-1">Identity & Access Management · OpenID Connect · SAML 2.0 · MFA</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("http://localhost:8080/admin/", "_blank")}>
            <Globe className="w-4 h-4 mr-2" />Open Keycloak Admin
          </Button>
          <Button size="sm" onClick={() => syncAllMutation.mutate({})} disabled={syncAllMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
            {syncAllMutation.isPending ? "Syncing…" : "Sync All Roles"}
          </Button>
        </div>
      </div>

      {/* Realm Selector */}
      <div className="flex gap-2">
        {REALMS.map(r => (
          <Button key={r.name} variant={selectedRealm === r.name ? "default" : "outline"} size="sm" onClick={() => setSelectedRealm(r.name)}>
            {r.displayName}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      {(() => {
        const realm = REALMS.find(r => r.name === selectedRealm)!;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: realm.users.toLocaleString(), icon: Users, color: "text-indigo-500" },
              { label: "OAuth Clients", value: realm.clients.toString(), icon: Key, color: "text-blue-500" },
              { label: "SSO Enabled", value: realm.ssoEnabled ? "Yes" : "No", icon: Globe, color: realm.ssoEnabled ? "text-green-500" : "text-red-500" },
              { label: "MFA Required", value: realm.mfaRequired ? "Yes" : "No", icon: Shield, color: realm.mfaRequired ? "text-green-500" : "text-amber-500" },
            ].map(m => (
              <Card key={m.label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <m.icon className={`w-8 h-8 ${m.color}`} />
                    <div><p className="text-2xl font-bold">{m.value}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="idp">Identity Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Authentication Flows</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { flow: "Browser Flow", type: "BASIC_FLOW", steps: "Cookie → Kerberos → Username/Password → OTP", active: true },
                  { flow: "Direct Grant", type: "BASIC_FLOW", steps: "Username/Password", active: true },
                  { flow: "Registration", type: "BASIC_FLOW", steps: "Registration Form → Email Verification", active: true },
                  { flow: "Reset Credentials", type: "BASIC_FLOW", steps: "Email → Reset Password", active: true },
                  { flow: "First Broker Login", type: "BASIC_FLOW", steps: "Review Profile → Link Account", active: true },
                ].map(f => (
                  <div key={f.flow} className="flex justify-between items-start py-1 border-b last:border-0">
                    <div>
                      <p className="font-medium">{f.flow}</p>
                      <p className="text-xs text-muted-foreground">{f.steps}</p>
                    </div>
                    <Badge variant={f.active ? "default" : "outline"}>{f.active ? "Active" : "Inactive"}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Token Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { setting: "Access Token Lifespan", value: "5 minutes" },
                  { setting: "Refresh Token Lifespan", value: "30 minutes" },
                  { setting: "SSO Session Idle", value: "30 minutes" },
                  { setting: "SSO Session Max", value: "10 hours" },
                  { setting: "Offline Session Idle", value: "30 days" },
                  { setting: "Token Signing Algorithm", value: "RS256" },
                  { setting: "PKCE Code Challenge Method", value: "S256" },
                ].map(s => (
                  <div key={s.setting} className="flex justify-between py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{s.setting}</span>
                    <span className="font-medium font-mono text-xs">{s.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">OAuth 2.0 Clients</CardTitle>
                <Button size="sm" onClick={() => toast.info("Create client flow — configure in Keycloak Admin UI")}>
                  + Add Client
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Redirect URIs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CLIENTS.map(c => (
                    <TableRow key={c.clientId}>
                      <TableCell className="font-mono text-xs">{c.clientId}</TableCell>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{c.protocol}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.redirectUris.join(", ") || "—"}</TableCell>
                      <TableCell><Badge variant={c.status === "enabled" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => toast.info(`Rotating secret for ${c.clientId}…`)}>
                          <Key className="w-3 h-3 mr-1" />Rotate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Realm Roles</CardTitle>
                <Button size="sm" onClick={() => toast.info("Create role flow — configure in Keycloak Admin UI")}>
                  + Add Role
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {REALM_ROLES.map(r => (
                    <TableRow key={r.name}>
                      <TableCell className="font-mono text-sm font-semibold">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                      <TableCell><Badge variant={r.composite ? "secondary" : "outline"}>{r.composite ? "Composite" : "Simple"}</Badge></TableCell>
                      <TableCell>{r.users.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => toast.info(`Managing permissions for ${r.name}`)}>
                          <Settings className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="idp" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Identity Providers</CardTitle>
                <Button size="sm" onClick={() => toast.info("Add identity provider in Keycloak Admin UI")}>
                  + Add Provider
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alias</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Sync Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {IDENTITY_PROVIDERS.map(p => (
                    <TableRow key={p.alias}>
                      <TableCell className="font-mono text-sm">{p.alias}</TableCell>
                      <TableCell className="font-medium">{p.displayName}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.syncMode}</Badge></TableCell>
                      <TableCell>
                        {p.enabled
                          ? <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Enabled</Badge>
                          : <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Disabled</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => toast.info(`${p.enabled ? "Disabling" : "Enabling"} ${p.displayName}`)}>
                          {p.enabled ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
