import { ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldX } from "lucide-react";

interface RoleGuardProps {
  children: ReactNode;
  /** Required role(s) — user must have at least one */
  roles?: Array<"admin" | "user" | "viewer" | "developer" | "support">;
  /** If true, redirect to /dashboard instead of showing 403 */
  redirect?: boolean;
  /** Custom fallback */
  fallback?: ReactNode;
}

/**
 * RoleGuard — wraps any route or component to enforce role-based access.
 *
 * Usage:
 *   <RoleGuard roles={["admin"]}>
 *     <AdminPage />
 *   </RoleGuard>
 */
export function RoleGuard({ children, roles, redirect = false, fallback }: RoleGuardProps) {
  const { user, loading } = useAuth();

  if (loading) return null;

  // Not authenticated → redirect to login
  if (!user) return <Redirect to="/" />;

  // No role restriction → allow
  if (!roles || roles.length === 0) return <>{children}</>;

  const userRole = (user as any).role ?? "user";
  const hasAccess = roles.includes(userRole) || userRole === "admin";

  if (!hasAccess) {
    if (redirect) return <Redirect to="/dashboard" />;
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <ShieldX className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              You don&apos;t have permission to view this page.
              {roles.length === 1 ? ` This area requires the ${roles[0]} role.` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Contact your account administrator to request access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/** Convenience wrapper for admin-only pages */
export function AdminGuard({ children, redirect }: { children: ReactNode; redirect?: boolean }) {
  return <RoleGuard roles={["admin"]} redirect={redirect}>{children}</RoleGuard>;
}

/** Convenience wrapper for developer-accessible pages */
export function DeveloperGuard({ children }: { children: ReactNode }) {
  return <RoleGuard roles={["admin", "developer"]}>{children}</RoleGuard>;
}

/** Convenience wrapper for support-accessible pages */
export function SupportGuard({ children }: { children: ReactNode }) {
  return <RoleGuard roles={["admin", "support"]}>{children}</RoleGuard>;
}
