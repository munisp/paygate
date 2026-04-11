import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function APIDocsPortal() {
  const {isLoading, data: spec} = trpc.newFeatures.apiDocs.getOpenAPISpec.useQuery();
  const { data: sdkInfo } = trpc.newFeatures.apiDocs.getSDKInfo.useQuery();
  const { data: changelog } = trpc.newFeatures.apiDocs.getChangelog.useQuery();

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  };

  // Extract endpoints from spec paths
  const endpoints = spec?.paths ? Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, { summary?: string; tags?: string[]; security?: unknown[] }>).map(([method, details]) => ({
      method: method.toUpperCase(),
      path,
      summary: details.summary ?? "",
      tags: details.tags ?? [],
      authenticated: !!details.security?.length,
    }))
  ) : [];

  const methodColors: Record<string, string> = {
    GET: "bg-green-100 text-green-700",
    POST: "bg-blue-100 text-blue-700",
    PUT: "bg-yellow-100 text-yellow-700",
    PATCH: "bg-orange-100 text-orange-700",
    DELETE: "bg-red-100 text-red-700",
  };

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Documentation</h1>
        {spec?.info?.version && <Badge variant="outline">v{spec.info.version}</Badge>}
      </div>

      {/* Overview */}
      {spec && (
        <Card>
          <CardHeader><CardTitle className="text-base">API Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div><p className="text-xs text-muted-foreground">Title</p><p className="font-semibold text-sm">{spec.info?.title}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Endpoints</p><p className="text-xl font-bold">{endpoints.length}</p></div>
              <div><p className="text-xs text-muted-foreground">OpenAPI</p><p className="text-sm font-semibold">{spec.openapi}</p></div>
              <div><p className="text-xs text-muted-foreground">Format</p><p className="text-sm font-semibold">JSON / REST</p></div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {endpoints.slice(0, 20).map((ep, i) => (
                <div key={i} className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/30">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${methodColors[ep.method] ?? "bg-gray-100 text-gray-700"}`}>{ep.method}</span>
                  <code className="text-xs flex-1 font-mono truncate">{ep.path}</code>
                  <p className="text-xs text-muted-foreground hidden md:block">{ep.summary}</p>
                  {ep.authenticated && <Badge variant="secondary" className="text-xs">Auth</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SDKs */}
      {sdkInfo && (
        <Card>
          <CardHeader><CardTitle>SDK Installation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sdkInfo.sdks?.map(sdk => (
                <div key={sdk.language} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-sm">{sdk.language}</p>
                    <Badge variant="outline">v{sdk.version}</Badge>
                  </div>
                  <div className="relative">
                    <code className="block bg-muted p-2 rounded text-xs font-mono break-all">{sdk.installCmd}</code>
                    <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-6 px-2 text-xs"
                      onClick={() => copyCode(sdk.installCmd)}>Copy</Button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <a href={sdk.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Docs →</a>
                    <a href={sdk.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">GitHub →</a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook Events */}
      {sdkInfo?.webhookEvents && (
        <Card>
          <CardHeader><CardTitle>Webhook Events</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sdkInfo.webhookEvents.map((event, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                  <code className="text-xs font-mono flex-1">{event.event}</code>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rate Limits */}
      {sdkInfo?.rateLimits && (
        <Card>
          <CardHeader><CardTitle>Rate Limits</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg">
                <p className="font-semibold text-sm mb-2">Sandbox</p>
                <p className="text-xs text-muted-foreground">{sdkInfo.rateLimits.sandbox.requestsPerMinute} req/min</p>
                <p className="text-xs text-muted-foreground">{sdkInfo.rateLimits.sandbox.requestsPerDay.toLocaleString()} req/day</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-semibold text-sm mb-2">Production</p>
                <p className="text-xs text-muted-foreground">{sdkInfo.rateLimits.production.requestsPerMinute} req/min</p>
                <p className="text-xs text-muted-foreground">{sdkInfo.rateLimits.production.requestsPerDay.toLocaleString()} req/day</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Changelog */}
      {changelog && (
        <Card>
          <CardHeader><CardTitle>Changelog</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {changelog.versions?.map(v => (
                <div key={v.version} className="border-l-2 border-primary pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-sm">v{v.version}</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.date).toLocaleDateString()}</p>
                  </div>
                  <ul className="space-y-0.5">
                    {v.changes?.map((c: any, i: any) => <li key={i} className="text-xs text-muted-foreground">• {c}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
