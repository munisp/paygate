import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function SSOConfigPage() {
  const { toast } = useToast();
  const { data, isLoading: me } = trpc.auth.me.useQuery();
  const [tenantId, setTenantId] = useState("ten_paygate_default");
  // Sync tenantId once merchant data loads
  useEffect(() => {
    const liveTenantId = (me as any)?.merchant?.tenantId;
    if (liveTenantId) setTenantId(liveTenantId);
  }, [me]);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    protocol: "oidc" as const,
    isEnabled: false,
    entityId: "",
    ssoUrl: "",
    sloUrl: "",
    certificate: "",
    clientId: "",
    clientSecret: "",
    discoveryUrl: "",
    scopes: "openid email profile",
  });

  const { data: config, refetch } = trpc.wave32.ssoConfigs.get.useQuery({ tenantId });

  const upsertMutation = trpc.wave32.ssoConfigs.upsert.useMutation({
    onSuccess: () => { toast({ title: "SSO configuration saved" }); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = trpc.wave32.ssoConfigs.test.useMutation({
    onSuccess: (r) => {
      setTesting(false);
      toast({ title: "SSO Test Passed", description: `Protocol: ${r.protocol} — ${r.message}` });
    },
    onError: (e) => {
      setTesting(false);
      toast({ title: "SSO Test Failed", description: e.message, variant: "destructive" });
    },
  });

  const currentForm = config ? {
    protocol: config.protocol as any,
    isEnabled: config.isEnabled ?? false,
    entityId: config.entityId ?? "",
    ssoUrl: config.ssoUrl ?? "",
    sloUrl: config.sloUrl ?? "",
    certificate: config.certificate ?? "",
    clientId: config.clientId ?? "",
    clientSecret: config.clientSecret ?? "",
    discoveryUrl: config.discoveryUrl ?? "",
    scopes: config.scopes ?? "openid email profile",
  } : form;

  const handleSave = () => {
    const g = (id: string) => (document.getElementById(`sso-${id}`) as HTMLInputElement)?.value ?? "";
    upsertMutation.mutate({
      tenantId,
      protocol: (document.getElementById("sso-protocol") as HTMLSelectElement)?.value as any ?? "oidc",
      isEnabled: (document.getElementById("sso-enabled") as HTMLInputElement)?.checked ?? false,
      entityId: g("entityId") || undefined,
      ssoUrl: g("ssoUrl") || undefined,
      sloUrl: g("sloUrl") || undefined,
      certificate: g("certificate") || undefined,
      clientId: g("clientId") || undefined,
      clientSecret: g("clientSecret") || undefined,
      discoveryUrl: g("discoveryUrl") || undefined,
      scopes: g("scopes") || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">SSO Configuration</h1>
        <p className="text-muted-foreground">Configure SAML, OIDC, or OAuth2 single sign-on for tenants.</p>
      </div>

      {/* Tenant Selector */}
      <div className="flex gap-3 items-center">
        <Label className="shrink-0">Tenant ID:</Label>
        <Input className="max-w-xs" value={tenantId} onChange={e => setTenantId(e.target.value)} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              SSO Settings
            </CardTitle>
            {config && (
              <div className="flex items-center gap-2 text-sm">
                {config.isEnabled ? (
                  <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" />Enabled</span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground"><AlertCircle className="h-4 w-4" />Disabled</span>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Protocol */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Protocol</Label>
              <Select defaultValue={currentForm.protocol} onValueChange={() => {}}>
                <SelectTrigger id="sso-protocol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oidc">OIDC</SelectItem>
                  <SelectItem value="saml">SAML 2.0</SelectItem>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <Label>Enable SSO</Label>
              <Switch id="sso-enabled" defaultChecked={currentForm.isEnabled} />
            </div>
          </div>

          {/* OIDC Fields */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">OIDC / OAuth2</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "clientId", label: "Client ID", placeholder: "your-client-id" },
                { id: "clientSecret", label: "Client Secret", placeholder: "your-client-secret", type: "password" },
                { id: "discoveryUrl", label: "Discovery URL", placeholder: "https://accounts.google.com/.well-known/openid-configuration", col: 2 },
                { id: "scopes", label: "Scopes", placeholder: "openid email profile", col: 2 },
              ].map(f => (
                <div key={f.id} className={f.col === 2 ? "col-span-2" : ""}>
                  <Label>{f.label}</Label>
                  <Input id={`sso-${f.id}`} type={f.type ?? "text"} defaultValue={(currentForm as any)[f.id]} placeholder={f.placeholder} />
                </div>
              ))}
            </div>
          </div>

          {/* SAML Fields */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">SAML 2.0</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "entityId", label: "Entity ID / Issuer", placeholder: "https://your-idp.com/saml/metadata" },
                { id: "ssoUrl", label: "SSO URL", placeholder: "https://your-idp.com/saml/sso" },
                { id: "sloUrl", label: "SLO URL", placeholder: "https://your-idp.com/saml/slo" },
              ].map(f => (
                <div key={f.id}>
                  <Label>{f.label}</Label>
                  <Input id={`sso-${f.id}`} defaultValue={(currentForm as any)[f.id]} placeholder={f.placeholder} />
                </div>
              ))}
              <div className="col-span-2">
                <Label>X.509 Certificate</Label>
                <textarea
                  id="sso-certificate"
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
                  defaultValue={currentForm.certificate}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Configuration"}
            </Button>
            {config?.isEnabled && (
              <Button variant="outline" onClick={() => { setTesting(true); testMutation.mutate({ tenantId }); }} disabled={testing}>
                {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</> : "Test Connection"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
