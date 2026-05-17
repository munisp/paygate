import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Monitor, Smartphone, Tablet, RefreshCw, Download, Share2,
  Palette, Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut
} from "lucide-react";

type ViewportMode = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<ViewportMode, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: "Desktop (1280×800)" },
  tablet: { width: 768, height: 1024, label: "Tablet (768×1024)" },
  mobile: { width: 375, height: 812, label: "Mobile (375×812)" },
};

const PREVIEW_SCREENS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "send_money", label: "Send Money" },
  { id: "transactions", label: "Transactions" },
  { id: "payment_link", label: "Payment Link" },
  { id: "virtual_card", label: "Virtual Card" },
];

const FONTS = ["Inter", "Poppins", "Roboto", "Lato", "Nunito", "Montserrat", "Open Sans"];

function generatePreviewHTML(config: {
  name: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl?: string;
  footerText?: string;
  screen: string;
  corridors: string[];
}) {
  const { name, primaryColor, accentColor, fontFamily, logoUrl, footerText, screen, corridors } = config;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="width:32px;height:32px;border-radius:6px;object-fit:contain;" onerror="this.style.display='none'">`
    : `<div style="width:32px;height:32px;border-radius:8px;background:${primaryColor};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">${name.charAt(0) || "P"}</div>`;

  const navLinks = ["Dashboard", "Send Money", "Transactions", "Cards", "Settings"];

  const navHtml = navLinks.map((link) => `
    <a href="#" style="color:${link === "Dashboard" ? primaryColor : "#6b7280"};text-decoration:none;font-size:14px;font-weight:${link === "Dashboard" ? "600" : "400"};padding:8px 12px;border-radius:6px;background:${link === "Dashboard" ? primaryColor + "15" : "transparent"};">
      ${link}
    </a>
  `).join("");

  let screenContent = "";

  if (screen === "dashboard") {
    screenContent = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;">
        ${[
          { label: "Total Balance", value: "₦2,450,000", change: "+12.5%", up: true },
          { label: "Sent This Month", value: "₦380,000", change: "+8.2%", up: true },
          { label: "Pending", value: "₦45,000", change: "-3.1%", up: false },
        ].map((stat) => `
          <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <div style="color:#6b7280;font-size:13px;margin-bottom:8px;">${stat.label}</div>
            <div style="font-size:24px;font-weight:700;color:#111827;margin-bottom:4px;">${stat.value}</div>
            <div style="font-size:12px;color:${stat.up ? "#10b981" : "#ef4444"};">${stat.change} vs last month</div>
          </div>
        `).join("")}
      </div>
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="font-weight:600;color:#111827;margin-bottom:16px;">Recent Transactions</div>
        ${[
          { name: "John Adeyemi", amount: "-₦50,000", type: "Transfer", status: "completed" },
          { name: "Payment Link #PL-001", amount: "+₦120,000", type: "Received", status: "completed" },
          { name: "USD Purchase", amount: "-₦75,000", type: "FX", status: "pending" },
          { name: "Virtual Card Top-up", amount: "-₦20,000", type: "Card", status: "completed" },
        ].map((tx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f4f6;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:36px;height:36px;border-radius:50%;background:${primaryColor}20;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:${primaryColor};">${tx.name.charAt(0)}</div>
              <div>
                <div style="font-size:14px;font-weight:500;color:#111827;">${tx.name}</div>
                <div style="font-size:12px;color:#6b7280;">${tx.type}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px;font-weight:600;color:${tx.amount.startsWith("+") ? "#10b981" : "#111827"};">${tx.amount}</div>
              <div style="font-size:11px;padding:2px 8px;border-radius:4px;background:${tx.status === "completed" ? "#d1fae5" : "#fef3c7"};color:${tx.status === "completed" ? "#065f46" : "#92400e"};">${tx.status}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } else if (screen === "send_money") {
    const corridorOptions = corridors.length > 0
      ? corridors.map((c) => `<option value="${c}">${c.replace("-", " → ")}</option>`).join("")
      : `<option>NGN → USD</option><option>NGN → GBP</option>`;
    screenContent = `
      <div style="max-width:480px;margin:0 auto;">
        <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <h2 style="font-size:22px;font-weight:700;color:#111827;margin-bottom:24px;">Send Money</h2>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Corridor</label>
            <select style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#111827;background:white;">
              ${corridorOptions}
            </select>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Recipient Name</label>
            <input type="text" placeholder="Enter recipient name" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#111827;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Account Number</label>
            <input type="text" placeholder="0123456789" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#111827;box-sizing:border-box;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Amount (NGN)</label>
              <input type="number" placeholder="50,000" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#111827;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">You Send (USD)</label>
              <input type="text" value="~$31.25" readonly style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#6b7280;background:#f9fafb;box-sizing:border-box;">
            </div>
          </div>
          <div style="background:${primaryColor}10;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#374151;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Exchange Rate</span><span style="font-weight:600;">1 USD = ₦1,600</span></div>
            <div style="display:flex;justify-content:space-between;"><span>Transfer Fee</span><span style="font-weight:600;color:${primaryColor};">₦750 (1.5%)</span></div>
          </div>
          <button style="width:100%;padding:14px;background:${primaryColor};color:white;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
            Send ₦50,000 →
          </button>
        </div>
      </div>
    `;
  } else if (screen === "transactions") {
    screenContent = `
      <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="font-size:18px;font-weight:700;color:#111827;">Transactions</h2>
          <div style="display:flex;gap:8px;">
            <input type="text" placeholder="Search..." style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">
            <select style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">
              <option>All Types</option><option>Transfer</option><option>FX</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto"><table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              ${["Date", "Reference", "Type", "Amount", "Status"].map((h) => `<th style="text-align:left;padding:10px 12px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${[
              { date: "Apr 19", ref: "TXN-001234", type: "Transfer", amount: "-₦50,000", status: "completed" },
              { date: "Apr 18", ref: "PL-005678", type: "Payment Link", amount: "+₦120,000", status: "completed" },
              { date: "Apr 18", ref: "FX-009012", type: "FX Buy", amount: "-₦75,000", status: "pending" },
              { date: "Apr 17", ref: "VC-003456", type: "Card", amount: "-₦20,000", status: "completed" },
              { date: "Apr 16", ref: "TXN-007890", type: "Transfer", amount: "-₦35,000", status: "failed" },
            ].map((tx) => `
              <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:12px;font-size:13px;color:#6b7280;">${tx.date}</td>
                <td style="padding:12px;font-size:13px;font-family:monospace;color:#374151;">${tx.ref}</td>
                <td style="padding:12px;font-size:13px;color:#374151;">${tx.type}</td>
                <td style="padding:12px;font-size:13px;font-weight:600;color:${tx.amount.startsWith("+") ? "#10b981" : "#111827"};">${tx.amount}</td>
                <td style="padding:12px;"><span style="font-size:11px;padding:3px 8px;border-radius:4px;background:${tx.status === "completed" ? "#d1fae5" : tx.status === "pending" ? "#fef3c7" : "#fee2e2"};color:${tx.status === "completed" ? "#065f46" : tx.status === "pending" ? "#92400e" : "#991b1b"};">${tx.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table></div>
      </div>
    `;
  } else if (screen === "payment_link") {
    screenContent = `
      <div style="max-width:480px;margin:0 auto;">
        <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <h2 style="font-size:22px;font-weight:700;color:#111827;margin-bottom:8px;">Create Payment Link</h2>
          <p style="color:#6b7280;font-size:14px;margin-bottom:24px;">Generate a shareable link to collect payments</p>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Title</label>
            <input type="text" placeholder="e.g. Invoice #001" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Amount (NGN)</label>
            <input type="number" placeholder="100,000" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:24px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Expires In</label>
            <select style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:white;">
              <option>24 hours</option><option>7 days</option><option>30 days</option><option>Never</option>
            </select>
          </div>
          <button style="width:100%;padding:14px;background:${primaryColor};color:white;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:12px;">
            Generate Link
          </button>
          <div style="background:#f9fafb;border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;color:#6b7280;font-family:monospace;">pay.${name.toLowerCase().replace(/\s+/g, "")}.com/pl-xxxx</span>
            <button style="padding:6px 12px;background:${accentColor};color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Copy</button>
          </div>
        </div>
      </div>
    `;
  } else if (screen === "virtual_card") {
    screenContent = `
      <div style="max-width:520px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,${primaryColor},${accentColor});border-radius:20px;padding:28px;color:white;margin-bottom:24px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.1);"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
            <div>
              <div style="font-size:12px;opacity:0.8;margin-bottom:4px;">Virtual Card</div>
              <div style="font-size:18px;font-weight:700;">${name}</div>
            </div>
            <div style="font-size:24px;font-weight:700;">VISA</div>
          </div>
          <div style="font-size:20px;font-weight:600;letter-spacing:4px;margin-bottom:20px;">4532 •••• •••• 7891</div>
          <div style="display:flex;justify-content:space-between;">
            <div><div style="font-size:10px;opacity:0.7;">CARDHOLDER</div><div style="font-size:14px;font-weight:600;">JOHN A. DOE</div></div>
            <div><div style="font-size:10px;opacity:0.7;">EXPIRES</div><div style="font-size:14px;font-weight:600;">04/29</div></div>
            <div><div style="font-size:10px;opacity:0.7;">CVV</div><div style="font-size:14px;font-weight:600;">•••</div></div>
          </div>
        </div>
        <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div><div style="font-size:13px;color:#6b7280;">Available Balance</div><div style="font-size:28px;font-weight:700;color:#111827;">₦45,000</div></div>
            <button style="padding:10px 20px;background:${primaryColor};color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Top Up</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${[
              { label: "Freeze Card", icon: "🔒" },
              { label: "View Details", icon: "👁" },
              { label: "Transactions", icon: "📋" },
              { label: "Settings", icon: "⚙️" },
            ].map((action) => `
              <button style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#374151;display:flex;align-items:center;gap:8px;">
                <span>${action.icon}</span>${action.label}
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — PayGate White Label</title>
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, "+")}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: '${fontFamily}', sans-serif; background: #f9fafb; color: #111827; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; }
    ::-webkit-scrollbar-thumb { background: ${primaryColor}; border-radius: 2px; }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <div style="display:flex;min-height:100vh;">
    <div style="width:220px;background:white;border-right:1px solid #e5e7eb;padding:20px;flex-shrink:0;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
        ${logoHtml}
        <div>
          <div style="font-weight:700;font-size:14px;color:#111827;">${name}</div>
          <div style="font-size:11px;color:#6b7280;">Merchant Portal</div>
        </div>
      </div>
      <nav style="display:flex;flex-direction:column;gap:4px;flex:1;">
        ${["Dashboard", "Send Money", "Transactions", "Payment Links", "Virtual Cards", "Analytics", "Settings"].map((item, i) => `
          <a href="#" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:${i === 0 ? "600" : "400"};color:${i === 0 ? primaryColor : "#6b7280"};background:${i === 0 ? primaryColor + "15" : "transparent"};">
            ${["📊", "💸", "📋", "🔗", "💳", "📈", "⚙️"][i]} ${item}
          </a>
        `).join("")}
      </nav>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${primaryColor};display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:600;">J</div>
          <div><div style="font-size:13px;font-weight:500;color:#111827;">John Doe</div><div style="font-size:11px;color:#6b7280;">Merchant</div></div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div style="flex:1;overflow:auto;">
      <!-- Top Bar -->
      <div style="background:white;border-bottom:1px solid #e5e7eb;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;">
        <h1 style="font-size:18px;font-weight:700;color:#111827;">${PREVIEW_SCREENS.find((s) => s.id === screen)?.label ?? "Dashboard"}</h1>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:13px;color:#6b7280;">Balance: <strong style="color:#111827;">₦2,450,000</strong></div>
          <button style="padding:8px 16px;background:${primaryColor};color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">+ New Transfer</button>
        </div>
      </div>

      <!-- Page Content -->
      <div style="padding:24px;">
        ${screenContent}
      </div>
    </div>
  </div>

  ${footerText ? `<div style="background:white;border-top:1px solid #e5e7eb;padding:12px 24px;text-align:center;font-size:12px;color:#9ca3af;">${footerText}</div>` : ""}
</body>
</html>`;
}

export default function WhiteLabelPreview() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenantId") ?? "";

  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [screen, setScreen] = useState("dashboard");
  const [zoom, setZoom] = useState(80);
  const [liveConfig, setLiveConfig] = useState({
    name: "Your Brand",
    primaryColor: "#6366f1",
    accentColor: "#8b5cf6",
    fontFamily: "Inter",
    logoUrl: "",
    footerText: "",
    corridors: ["NGN-USD", "NGN-GBP"],
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  // Load tenant data if tenantId provided
  const { data: tenantData, isLoading, isError } = trpc.wave28.tenantAdmin.getOverview.useQuery(
    { tenantId },
    { enabled: !!tenantId }, staleTime: 30_000})

  useEffect(() => {
    if (tenantData?.tenant) {
      const t = tenantData.tenant;
      setLiveConfig({
        name: t.name ?? "Your Brand",
        primaryColor: t.primary_color ?? "#6366f1",
        accentColor: t.accent_color ?? "#8b5cf6",
        fontFamily: t.font_family ?? "Inter",
        logoUrl: t.logo_url ?? "",
        footerText: t.footer_text ?? "",
        corridors: ["NGN-USD", "NGN-GBP"],
      });
    }
  }, [tenantData]);

  // Regenerate preview HTML whenever config or screen changes
  useEffect(() => {
    const html = generatePreviewHTML({ ...liveConfig, screen });
    setPreviewHtml(html);
  }, [liveConfig, screen]);

  // Inject HTML into iframe
  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewHtml);
        doc.close();
      }
    }
  }, [previewHtml]);

  const vp = VIEWPORT_SIZES[viewport];

  const handleDownloadHtml = () => {
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${liveConfig.name.replace(/\s+/g, "_")}_preview.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Preview HTML downloaded");
  };

  const handleCopyShareLink = () => {
    const url = tenantId
      ? `${window.location.origin}/partner/preview?tenantId=${tenantId}`
      : window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  };

  const screenIdx = PREVIEW_SCREENS.findIndex((s) => s.id === screen);

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
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Eye className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">White-Label Preview</div>
            <div className="text-gray-400 text-xs">{liveConfig.name}</div>
          </div>
        </div>

        {/* Viewport Switcher */}
        <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1">
          {(["desktop", "tablet", "mobile"] as ViewportMode[]).map((v) => {
            const Icon = v === "desktop" ? Monitor : v === "tablet" ? Tablet : Smartphone;
            return (
              <button key={v} onClick={() => setViewport(v)}
                className={`p-2 rounded-md transition-colors ${viewport === v ? "bg-gray-500 text-white" : "text-gray-400 hover:text-white"}`}
                title={VIEWPORT_SIZES[v].label}>
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Screen Navigation */}
        <div className="flex items-center gap-2">
          <button onClick={() => setScreen(PREVIEW_SCREENS[Math.max(0, screenIdx - 1)].id)}
            disabled={screenIdx === 0} className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Select value={screen} onValueChange={setScreen}>
            <SelectTrigger className="w-40 h-8 bg-gray-700 border-gray-600 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREVIEW_SCREENS.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={() => setScreen(PREVIEW_SCREENS[Math.min(PREVIEW_SCREENS.length - 1, screenIdx + 1)].id)}
            disabled={screenIdx === PREVIEW_SCREENS.length - 1} className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <ZoomOut className="w-4 h-4 text-gray-400" />
          <div className="w-24">
            <Slider value={[zoom]} onValueChange={([v]) => setZoom(v)} min={30} max={100} step={5} />
          </div>
          <ZoomIn className="w-4 h-4 text-gray-400" />
          <span className="text-gray-400 text-xs w-10">{zoom}%</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:text-white h-8"
            onClick={handleCopyShareLink}>
            <Share2 className="w-3 h-3 mr-1" />Share
          </Button>
          <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:text-white h-8"
            onClick={handleDownloadHtml}>
            <Download className="w-3 h-3 mr-1" />Export
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Live Config */}
        <div className="w-72 bg-gray-800 border-r border-gray-700 overflow-y-auto p-4 space-y-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Palette className="w-4 h-4 text-indigo-400" />
            Live Configuration
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Brand Name</Label>
            <Input value={liveConfig.name} onChange={(e) => setLiveConfig({ ...liveConfig, name: e.target.value })}
              className="mt-1 bg-gray-700 border-gray-600 text-white text-sm h-8" />
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Primary Color</Label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={liveConfig.primaryColor}
                onChange={(e) => setLiveConfig({ ...liveConfig, primaryColor: e.target.value })}
                className="w-10 h-8 rounded border border-gray-600 cursor-pointer bg-transparent" />
              <Input value={liveConfig.primaryColor}
                onChange={(e) => setLiveConfig({ ...liveConfig, primaryColor: e.target.value })}
                className="bg-gray-700 border-gray-600 text-white text-xs h-8 font-mono" maxLength={7} />
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Accent Color</Label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={liveConfig.accentColor}
                onChange={(e) => setLiveConfig({ ...liveConfig, accentColor: e.target.value })}
                className="w-10 h-8 rounded border border-gray-600 cursor-pointer bg-transparent" />
              <Input value={liveConfig.accentColor}
                onChange={(e) => setLiveConfig({ ...liveConfig, accentColor: e.target.value })}
                className="bg-gray-700 border-gray-600 text-white text-xs h-8 font-mono" maxLength={7} />
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Font Family</Label>
            <Select value={liveConfig.fontFamily} onValueChange={(v) => setLiveConfig({ ...liveConfig, fontFamily: v })}>
              <SelectTrigger className="mt-1 bg-gray-700 border-gray-600 text-white text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Logo URL</Label>
            <Input value={liveConfig.logoUrl} onChange={(e) => setLiveConfig({ ...liveConfig, logoUrl: e.target.value })}
              placeholder="https://..." className="mt-1 bg-gray-700 border-gray-600 text-white text-xs h-8" />
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Footer Text</Label>
            <Input value={liveConfig.footerText} onChange={(e) => setLiveConfig({ ...liveConfig, footerText: e.target.value })}
              placeholder="© 2026 Your Company" className="mt-1 bg-gray-700 border-gray-600 text-white text-xs h-8" />
          </div>

          {/* Color Presets */}
          <div>
            <Label className="text-gray-400 text-xs mb-2 block">Color Presets</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { primary: "#6366f1", accent: "#8b5cf6" },
                { primary: "#0ea5e9", accent: "#06b6d4" },
                { primary: "#10b981", accent: "#059669" },
                { primary: "#f59e0b", accent: "#d97706" },
                { primary: "#ef4444", accent: "#dc2626" },
                { primary: "#8b5cf6", accent: "#7c3aed" },
                { primary: "#ec4899", accent: "#db2777" },
                { primary: "#14b8a6", accent: "#0d9488" },
              ].map((preset) => (
                <button key={preset.primary}
                  onClick={() => setLiveConfig({ ...liveConfig, primaryColor: preset.primary, accentColor: preset.accent })}
                  className="w-8 h-8 rounded-full border-2 border-gray-600 hover:border-white transition-colors"
                  style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})` }}
                  title={preset.primary} />
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-700">
            <div className="text-gray-400 text-xs mb-2">Viewport: {vp.label}</div>
            <Badge className="bg-indigo-900 text-indigo-300 text-xs">
              {screen.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-8 bg-gray-900">
          <div
            className="relative bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300"
            style={{
              width: vp.width,
              height: vp.height,
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top center",
              minWidth: vp.width,
            }}>
            {/* Device Frame */}
            {viewport === "mobile" && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-xl" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="White-label preview"
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
