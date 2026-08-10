/**
 * TenantBrandingProvider
 * Fetches per-tenant branding from the API and applies CSS variables at runtime.
 * Supports white-label deployments where each tenant has a custom logo, colors, and font.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

interface TenantBranding {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  footerText: string | null;
  supportEmail: string | null;
  customDomain: string | null;
}

interface TenantBrandingContextValue {
  branding: TenantBranding | null;
  loading: boolean;
  isWhiteLabel: boolean;
}

const DEFAULT_BRANDING: TenantBranding = {
  id: "default",
  name: "PayGate",
  slug: "paygate",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#6366f1",
  secondaryColor: "#8b5cf6",
  fontFamily: "Inter",
  footerText: "© 2026 PayGate. All rights reserved.",
  supportEmail: "support@paygate.ng",
  customDomain: null,
};

const TenantBrandingContext = createContext<TenantBrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: false,
  isWhiteLabel: false,
});

export function TenantBrandingProvider({
  tenantId,
  slug,
  children,
}: {
  tenantId?: string;
  slug?: string;
  children: React.ReactNode;
}) {
  const [applied, setApplied] = useState(false);

  const { data, isLoading } = trpc.wave26.whiteLabel.getBranding.useQuery(
    { tenantId, slug },
    {
      enabled: !!(tenantId || slug),
      staleTime: 10 * 60 * 1000,
      retry: false,
    }
  );

  const branding: TenantBranding = data
    ? {
        id: String(data.id ?? ""),
        name: String(data.name ?? DEFAULT_BRANDING.name),
        slug: String(data.slug ?? ""),
        logoUrl: data.logo_url ? String(data.logo_url) : null,
        faviconUrl: data.favicon_url ? String(data.favicon_url) : null,
        primaryColor: String(data.primary_color ?? DEFAULT_BRANDING.primaryColor),
        secondaryColor: String(data.secondary_color ?? DEFAULT_BRANDING.secondaryColor),
        fontFamily: String(data.font_family ?? DEFAULT_BRANDING.fontFamily),
        footerText: data.footer_text ? String(data.footer_text) : null,
        supportEmail: data.support_email ? String(data.support_email) : null,
        customDomain: data.custom_domain ? String(data.custom_domain) : null,
      }
    : DEFAULT_BRANDING;

  // Apply CSS variables to :root whenever branding changes
  useEffect(() => {
    if (!data && !applied) return;
    const root = document.documentElement;
    // Convert hex to HSL for Tailwind/shadcn compatibility
    const hexToHsl = (hex: string): string => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    const primary = branding.primaryColor.startsWith("#")
      ? hexToHsl(branding.primaryColor) : branding.primaryColor;
    const secondary = branding.secondaryColor.startsWith("#")
      ? hexToHsl(branding.secondaryColor) : branding.secondaryColor;

    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--secondary", secondary);
    root.style.setProperty("--font-family-brand", branding.fontFamily);

    // Update favicon if provided
    if (branding.faviconUrl) {
      const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
        ?? document.createElement("link");
      link.type = "image/x-icon";
      link.rel = "shortcut icon";
      link.href = branding.faviconUrl;
      document.head.appendChild(link);
    }

    // Update document title with tenant name
    if (data && branding.name !== "PayGate") {
      document.title = `${branding.name} Portal`;
    }

    setApplied(true);
  }, [branding.primaryColor, branding.secondaryColor, branding.fontFamily, branding.faviconUrl, data]);

  return (
    <TenantBrandingContext.Provider
      value={{
        branding,
        loading: isLoading,
        isWhiteLabel: !!(tenantId || slug) && !!data,
      }}
    >
      {children}
    </TenantBrandingContext.Provider>
  );
}

export function useTenantBranding() {
  return useContext(TenantBrandingContext);
}
