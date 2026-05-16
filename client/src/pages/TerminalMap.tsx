import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wifi, WifiOff, AlertTriangle, MapPin, RefreshCw } from "lucide-react";
import { useAdaptiveInterval } from "@/lib/networkQuality";

// ─── Types ────────────────────────────────────────────────────────────────────

type Terminal = {
  id: string;
  serialNumber: string;
  model: string;
  label: string | null;
  location: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  lastHeartbeatAt: string | null;
  audioLanguage: string;
  totalTransactions: number;
  totalVolumeKobo: number;
};

// ─── Health helpers ───────────────────────────────────────────────────────────

function getHealthStatus(terminal: Terminal): "online" | "warning" | "offline" {
  if (!terminal.lastHeartbeatAt) return "offline";
  const ageMs = Date.now() - new Date(terminal.lastHeartbeatAt).getTime();
  if (ageMs < 5 * 60 * 1000) return "online";     // < 5 min → green
  if (ageMs < 30 * 60 * 1000) return "warning";   // < 30 min → amber
  return "offline";                                 // > 30 min → grey
}

const HEALTH_COLORS: Record<string, string> = {
  online:  "#22c55e",   // green-500
  warning: "#f59e0b",   // amber-500
  offline: "#6b7280",   // gray-500
};

const HEALTH_LABELS: Record<string, string> = {
  online:  "Online",
  warning: "Stale",
  offline: "Offline",
};

// Nigerian city defaults for terminals without GPS
const NIGERIAN_CITIES: Record<string, { lat: number; lng: number }> = {
  lagos:       { lat: 6.5244,  lng: 3.3792  },
  abuja:       { lat: 9.0579,  lng: 7.4951  },
  "port harcourt": { lat: 4.8156, lng: 7.0498 },
  kano:        { lat: 12.0022, lng: 8.5920  },
  ibadan:      { lat: 7.3775,  lng: 3.9470  },
  enugu:       { lat: 6.4584,  lng: 7.5464  },
  benin:       { lat: 6.3350,  lng: 5.6037  },
};

function guessCoords(terminal: Terminal): { lat: number; lng: number } | null {
  if (terminal.latitude !== null && terminal.longitude !== null) {
    return { lat: terminal.latitude / 1e6, lng: terminal.longitude / 1e6 };
  }
  if (terminal.location) {
    const loc = terminal.location.toLowerCase();
    for (const [city, coords] of Object.entries(NIGERIAN_CITIES)) {
      if (loc.includes(city)) return coords;
    }
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TerminalMap() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const terminalMapInterval = useAdaptiveInterval(30000);
  const [filter, setFilter] = useState<"all" | "online" | "warning" | "offline">("all");
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data, isLoading, refetch } = trpc.pos.list.useQuery(
    { limit: 200 },
    { refetchInterval: terminalMapInterval }
  , { staleTime: 30_000 });

  const updateLocation = trpc.pos.updateLocation.useMutation({ onError: (e) => toast.error(e.message) });

  const terminals: Terminal[] = (data?.rows ?? []) as Terminal[];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:   terminals.length,
    online:  terminals.filter(t => getHealthStatus(t) === "online").length,
    warning: terminals.filter(t => getHealthStatus(t) === "warning").length,
    offline: terminals.filter(t => getHealthStatus(t) === "offline").length,
  };

  const filtered = filter === "all"
    ? terminals
    : terminals.filter(t => getHealthStatus(t) === filter);

  // ── Map initialisation ─────────────────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, []);

  // ── Sync markers whenever terminals or filter changes ──────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!filtered.find(t => t.id === id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });

    filtered.forEach(terminal => {
      const coords = guessCoords(terminal);
      if (!coords) return;

      const health = getHealthStatus(terminal);
      const color = HEALTH_COLORS[health];

      // Build a coloured SVG pin
      const svgPin = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 16 24 16 24s16-13.5 16-24C32 7.163 24.837 0 16 0z"
                fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
          <text x="16" y="20" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">
            ${terminal.model === "soundbox_basic" ? "🔊" : "💳"}
          </text>
        </svg>`;

      const existing = markersRef.current.get(terminal.id);
      if (existing) {
        existing.position = coords;
        (existing as any).content = createPinElement(svgPin);
      } else {
        const pinEl = createPinElement(svgPin);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: coords,
          title: terminal.label ?? terminal.serialNumber,
          content: pinEl,
        });
        marker.addListener("click", () => {
          setSelectedTerminal(terminal);
          if (infoWindowRef.current) {
            infoWindowRef.current.setContent(buildInfoWindowContent(terminal, health, color));
            infoWindowRef.current.open({ map, anchor: marker });
          }
        });
        markersRef.current.set(terminal.id, marker);
      }
    });

    // Fit bounds to all visible markers
    if (filtered.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filtered.forEach(t => {
        const c = guessCoords(t);
        if (c) bounds.extend(c);
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    }
  }, [mapReady, filtered]);

  // ── Allow clicking map to set terminal location ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedTerminal) return;
    const listener = mapRef.current.addListener("click", async (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !selectedTerminal) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      await updateLocation.mutateAsync({ terminalId: selectedTerminal.id, latitude: lat, longitude: lng });
      refetch();
    });
    return () => google.maps.event.removeListener(listener);
  }, [mapReady, selectedTerminal, updateLocation, refetch]);

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Terminal Map</h1>
          <p className="text-sm text-muted-foreground">
            Real-time health overlay for all POS terminals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({stats.total})</SelectItem>
              <SelectItem value="online">Online ({stats.online})</SelectItem>
              <SelectItem value="warning">Stale ({stats.warning})</SelectItem>
              <SelectItem value="offline">Offline ({stats.offline})</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total",   value: stats.total,   icon: MapPin,       color: "text-foreground" },
          { label: "Online",  value: stats.online,  icon: Wifi,         color: "text-green-500"  },
          { label: "Stale",   value: stats.warning, icon: AlertTriangle, color: "text-amber-500" },
          { label: "Offline", value: stats.offline, icon: WifiOff,      color: "text-gray-500"   },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-3">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Map + sidebar */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading terminals…
            </div>
          ) : (
            <MapView
              initialCenter={{ lat: 9.0579, lng: 7.4951 }}  // Abuja default
              initialZoom={6}
              onMapReady={handleMapReady}
            />
          )}
        </div>

        {/* Terminal list sidebar */}
        <div className="w-72 flex flex-col gap-2 overflow-y-auto">
          <p className="text-sm font-medium text-muted-foreground px-1">
            {filtered.length} terminal{filtered.length !== 1 ? "s" : ""}
            {selectedTerminal && " · click map to reposition selected"}
          </p>
          {filtered.map(terminal => {
            const health = getHealthStatus(terminal);
            const isSelected = selectedTerminal?.id === terminal.id;
            return (
              <Card
                key={terminal.id}
                className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
                onClick={() => {
                  setSelectedTerminal(isSelected ? null : terminal);
                  const coords = guessCoords(terminal);
                  if (coords && mapRef.current) {
                    mapRef.current.panTo(coords);
                    mapRef.current.setZoom(14);
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {terminal.label ?? terminal.serialNumber}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {terminal.location ?? "No location set"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {terminal.model.replace(/_/g, " ")} · {terminal.audioLanguage.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: HEALTH_COLORS[health], color: HEALTH_COLORS[health] }}
                      >
                        {HEALTH_LABELS[health]}
                      </Badge>
                      {guessCoords(terminal) === null && (
                        <span className="text-xs text-amber-500">No GPS</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    <span>₦{(terminal.totalVolumeKobo / 100).toLocaleString()}</span>
                    <span>{terminal.totalTransactions} txns</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              No terminals match this filter.
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {Object.entries(HEALTH_COLORS).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
            {HEALTH_LABELS[key]}
          </span>
        ))}
        <span className="ml-auto">Click a terminal, then click the map to set its GPS location.</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// VULN-006 FIX: Use DOMParser to parse SVG safely, then strip script/event-handler attributes
function sanitizeSvg(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) return null;
  const svg = doc.documentElement;
  // Remove all <script> elements
  svg.querySelectorAll("script").forEach((el) => el.remove());
  // Remove all event-handler attributes (on*)
  const allElements = svg.querySelectorAll("*");
  allElements.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on") || attr.name.toLowerCase() === "href" && attr.value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return svg as unknown as SVGElement;
}

function createPinElement(svgString: string): HTMLElement {
  const div = document.createElement("div");
  const safeSvg = sanitizeSvg(svgString);
  if (safeSvg) {
    div.appendChild(document.importNode(safeSvg, true));
  }
  return div;
}

function buildInfoWindowContent(terminal: Terminal, health: string, color: string): string {
  const lastSeen = terminal.lastHeartbeatAt
    ? new Date(terminal.lastHeartbeatAt).toLocaleString()
    : "Never";
  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:200px">
      <strong style="font-size:15px">${terminal.label ?? terminal.serialNumber}</strong>
      <div style="margin-top:4px">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:white;font-size:11px">
          ${HEALTH_LABELS[health]}
        </span>
      </div>
      <div className="overflow-x-auto"><table style="margin-top:8px;border-collapse:collapse;width:100%">
        <tr><td style="color:#888;padding:2px 0">Model</td><td>${terminal.model.replace(/_/g, " ")}</td></tr>
        <tr><td style="color:#888;padding:2px 0">Serial</td><td>${terminal.serialNumber}</td></tr>
        <tr><td style="color:#888;padding:2px 0">Location</td><td>${terminal.location ?? "—"}</td></tr>
        <tr><td style="color:#888;padding:2px 0">Last seen</td><td>${lastSeen}</td></tr>
        <tr><td style="color:#888;padding:2px 0">Volume</td><td>₦${(terminal.totalVolumeKobo / 100).toLocaleString()}</td></tr>
        <tr><td style="color:#888;padding:2px 0">Transactions</td><td>${terminal.totalTransactions}</td></tr>
      </table></div>
    </div>`;
}
