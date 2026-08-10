// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Key, Globe, CheckCircle, AlertCircle, Save } from "lucide-react";

export default function TenantSsoConfig() {
  const tenantId = "3";
  const { data: config, refetch, isLoading } = trpc.wave29.tenantSso.getConfig.useQuery({ tenantId }, { staleTime: 30_000 });

  const [form, setForm] = useState({
    provider: "oidc" as "oidc" | "saml" | "oauth2",
    clientId: "paygate-tenant-sso",
    clientSecret: "sso-secret-placeholder",
    discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
    redirectUri: "https://paygate.io/api/oauth/sso/callback",
    scopes: "openid email profile",
    isEnabled: false,
  });

  const upsert = trpc.wave29.tenantSso.upsertConfig.useMutation({
    onSuccess: () => { toast.success("SSO configuration saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const toggle = trpc.wave29.tenantSso.toggleSso.useMutation({
    onSuccess: () => { toast.success("SSO status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SSO Configuration</h1>
        <p className="text-gray-500 mt-1">Configure Single Sign-On for your tenant using OIDC, SAML, or OAuth2</p>
      </div>

      {/* Current Status */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {config?.is_enabled ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-gray-400" />
              )}
              <div>
                <p className="font-medium">
                  SSO is {config?.is_enabled ? "enabled" : "disabled"}
                </p>
                {config && (
                  <p className="text-sm text-gray-500">
                    Provider: <Badge variant="outline">{config.provider?.toUpperCase()}</Badge>
                    {" · "}Client ID: {config.client_id}
                  </p>
                )}
              </div>
            </div>
            {config && (
              <Switch
                checked={config.is_enabled}
                onCheckedChange={v => toggle.mutate({ tenantId, enabled: v })}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            SSO Provider Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Provider</Label>
            <div className="flex gap-2 mt-1">
              {(["oidc", "saml", "oauth2"] as const).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={form.provider === p ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, provider: p }))}
                >
                  {p.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Client ID</Label>
              <Input
                value={form.clientId}
                onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                placeholder="your-client-id"
              />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input
                type="password"
                value={form.clientSecret}
                onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                placeholder="your-client-secret"
              />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1">
              <Globe className="w-4 h-4" />
              Discovery URL (OIDC)
            </Label>
            <Input
              value={form.discoveryUrl}
              onChange={e => setForm(f => ({ ...f, discoveryUrl: e.target.value }))}
              placeholder="https://accounts.example.com/.well-known/openid-configuration"
            />
          </div>

          <div>
            <Label className="flex items-center gap-1">
              <Key className="w-4 h-4" />
              Redirect URI
            </Label>
            <Input
              value={form.redirectUri}
              onChange={e => setForm(f => ({ ...f, redirectUri: e.target.value }))}
              placeholder="https://your-app.com/api/oauth/sso/callback"
            />
          </div>

          <div>
            <Label>Scopes</Label>
            <Input
              value={form.scopes}
              onChange={e => setForm(f => ({ ...f, scopes: e.target.value }))}
              placeholder="openid email profile"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.isEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))}
            />
            <Label>Enable SSO after saving</Label>
          </div>

          <Button
            className="w-full"
            onClick={() => upsert.mutate({ tenantId, ...form })}
            disabled={upsert.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Save SSO Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Quick Setup Guides */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Setup Guides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Google Workspace", discovery: "https://accounts.google.com/.well-known/openid-configuration", provider: "oidc" },
            { name: "Microsoft Entra ID", discovery: "https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration", provider: "oidc" },
            { name: "Okta", discovery: "https://{domain}/.well-known/openid-configuration", provider: "oidc" },
            { name: "Auth0", discovery: "https://{domain}/.well-known/openid-configuration", provider: "oidc" },
          ].map(guide => (
            <div
              key={guide.name}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => setForm(f => ({
                ...f,
                provider: guide.provider as any,
                discoveryUrl: guide.discovery,
              }))}
            >
              <span className="font-medium text-sm">{guide.name}</span>
              <Badge variant="outline">{guide.provider.toUpperCase()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
