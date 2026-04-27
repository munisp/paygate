import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Loader2, Shield, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bank {
  id: string;
  bankCode: string;
  bankName: string;
  shortName: string;
  isActive: number;
  supportsNip: number;
}

interface ResolutionError {
  id: number;
  bankCode: string;
  accountNumber: string;
  attemptNumber: number;
  errorCode: string | null;
  errorMessage: string | null;
  errorSource: string | null;
  resolvedAt: Date | null;
  resolvedAccountName: string | null;
  createdAt: Date;
}

// ─── NIPBanks Page ────────────────────────────────────────────────────────────

export default function NIPBanks() {
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBankCode, setSelectedBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolveResult, setResolveResult] = useState<{
    accountName: string; bankCode: string; accountNumber: string;
    fromCache: boolean; attempts: number; errors: any[];
  } | null>(null);
  const [errorPage, setErrorPage] = useState(0);
  const ERROR_PAGE_SIZE = 15;

  // ─── Queries ────────────────────────────────────────────────────────────────

  const banksQuery = trpc.nip.listBanks.useQuery(
    { search: bankSearch || undefined },
    { staleTime: 5 * 60 * 1000 }
  );

  const errorsQuery = trpc.nip.listResolutionErrors.useQuery({
    limit: ERROR_PAGE_SIZE,
    offset: errorPage * ERROR_PAGE_SIZE,
  });

  const errorStatsQuery = trpc.nip.errorStats.useQuery(undefined, {
    staleTime: 30 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const resolveMutation = trpc.nip.resolveAccountWithRetry.useMutation({
    onSuccess: (data) => {
      setResolveResult(data);
      if (data.attempts > 1) {
        toast.success(`Account resolved after ${data.attempts} attempts`);
      } else {
        toast.success("Account name resolved successfully");
      }
      errorsQuery.refetch();
      errorStatsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
      errorsQuery.refetch();
      errorStatsQuery.refetch();
    },
  });

  // ─── Derived data ────────────────────────────────────────────────────────────

  const banks: Bank[] = (banksQuery.data?.banks as Bank[]) ?? [];
  const errors: ResolutionError[] = (errorsQuery.data?.rows as ResolutionError[]) ?? [];
  const errorTotal = errorsQuery.data?.total ?? 0;
  const stats = errorStatsQuery.data;

  const selectedBank = useMemo(
    () => banks.find(b => b.bankCode === selectedBankCode),
    [banks, selectedBankCode]
  );

  const canResolve = selectedBankCode.length >= 3 && accountNumber.length === 10;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleResolve() {
    if (!canResolve) return;
    setResolveResult(null);
    resolveMutation.mutate({ bankCode: selectedBankCode, accountNumber, maxAttempts: 3 });
  }

  function handleClear() {
    setResolveResult(null);
    setSelectedBankCode("");
    setAccountNumber("");
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            CBN NIP Bank Directory
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Nigeria Inter-Bank Settlement System — all participating banks and account name enquiry
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50">
          <Shield className="w-3 h-3" />
          CBN Regulated
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Banks</p>
            <p className="text-2xl font-bold">{banks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">NIP Enabled</p>
            <p className="text-2xl font-bold text-green-600">
              {banks.filter(b => b.supportsNip).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Resolution Errors</p>
            <p className="text-2xl font-bold text-amber-600">{stats?.unresolved ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Auto-Resolved</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.resolved ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="banks">
        <TabsList>
          <TabsTrigger value="banks">Bank Directory</TabsTrigger>
          <TabsTrigger value="resolver">Account Resolver</TabsTrigger>
          <TabsTrigger value="errors">
            Error Log
            {(stats?.unresolved ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-2 h-4 px-1 text-xs">
                {stats?.unresolved}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Bank Directory Tab ─────────────────────────────────────────── */}
        <TabsContent value="banks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search banks..."
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => banksQuery.refetch()}
                  disabled={banksQuery.isFetching}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${banksQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {banksQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading bank directory...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bank Code</TableHead>
                      <TableHead>Bank Name</TableHead>
                      <TableHead>Short Name</TableHead>
                      <TableHead>NIP Status</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No banks found{bankSearch ? ` matching "${bankSearch}"` : ""}
                        </TableCell>
                      </TableRow>
                    ) : (
                      banks.map((bank) => (
                        <TableRow key={bank.bankCode} className="hover:bg-muted/30">
                          <TableCell>
                            <code className="bg-muted px-2 py-0.5 rounded text-sm font-mono">
                              {bank.bankCode}
                            </code>
                          </TableCell>
                          <TableCell className="font-medium">{bank.bankName}</TableCell>
                          <TableCell className="text-muted-foreground">{bank.shortName}</TableCell>
                          <TableCell>
                            {bank.supportsNip ? (
                              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                NIP Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground gap-1">
                                <XCircle className="w-3 h-3" />
                                No NIP
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {bank.isActive ? (
                              <Badge variant="outline" className="text-green-600 border-green-300">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600 border-red-300">Inactive</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account Resolver Tab ───────────────────────────────────────── */}
        <TabsContent value="resolver" className="mt-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Name Enquiry</CardTitle>
                <CardDescription>
                  Resolve account holder name via CBN NIP. Results are cached for 24 hours.
                  Failed attempts are automatically retried up to 3 times with exponential backoff.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bank</label>
                  <Select value={selectedBankCode} onValueChange={setSelectedBankCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a bank..." />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map(b => (
                        <SelectItem key={b.bankCode} value={b.bankCode}>
                          <span className="font-mono text-xs text-muted-foreground mr-2">{b.bankCode}</span>
                          {b.bankName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Number</label>
                  <Input
                    placeholder="10-digit NUBAN account number"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    maxLength={10}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {accountNumber.length}/10 digits
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleResolve}
                    disabled={!canResolve || resolveMutation.isPending}
                    className="flex-1"
                  >
                    {resolveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Resolving...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Resolve Account
                      </>
                    )}
                  </Button>
                  {resolveResult && (
                    <Button variant="outline" onClick={handleClear}>Clear</Button>
                  )}
                </div>

                {/* Retry info */}
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    Automatic retry with exponential backoff (500ms → 1s → 2s). Each failed attempt
                    is logged to the Error Log for audit and monitoring.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Result card */}
            <Card className={resolveResult ? "border-green-300 bg-green-50/30" : ""}>
              <CardHeader>
                <CardTitle className="text-base">Resolution Result</CardTitle>
              </CardHeader>
              <CardContent>
                {!resolveResult && !resolveMutation.isPending && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Building2 className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Enter bank and account number to resolve</p>
                  </div>
                )}

                {resolveMutation.isPending && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
                    <p className="text-sm">Querying NIBSS NIP gateway...</p>
                    <p className="text-xs mt-1">Retrying automatically on failure</p>
                  </div>
                )}

                {resolveResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-700">Resolved Successfully</span>
                      {resolveResult.fromCache && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="w-3 h-3" />
                          Cached
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-white rounded-lg border">
                        <p className="text-xs text-muted-foreground">Account Name</p>
                        <p className="text-lg font-bold mt-0.5">{resolveResult.accountName}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-white rounded-lg border">
                          <p className="text-xs text-muted-foreground">Bank Code</p>
                          <p className="font-mono font-medium">{resolveResult.bankCode}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border">
                          <p className="text-xs text-muted-foreground">Account Number</p>
                          <p className="font-mono font-medium">{resolveResult.accountNumber}</p>
                        </div>
                      </div>
                      {resolveResult.attempts > 1 && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs text-amber-700 font-medium">
                            ⚡ Resolved after {resolveResult.attempts} attempts
                          </p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {resolveResult.errors.length} failed attempt(s) logged
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Error Log Tab ─────────────────────────────────────────────── */}
        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Resolution Error Log</CardTitle>
                  <CardDescription>
                    All failed NIP account name enquiry attempts. Auto-retried errors show resolution status.
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  {stats?.topFailingBanks && stats.topFailingBanks.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Top failing: {stats.topFailingBanks.slice(0, 2).map(b => `${b.bankCode} (${b.count})`).join(", ")}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { errorsQuery.refetch(); errorStatsQuery.refetch(); }}
                    disabled={errorsQuery.isFetching}
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${errorsQuery.isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {errorsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading error log...
                </div>
              ) : errors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mb-3 text-green-400" />
                  <p className="font-medium">No resolution errors</p>
                  <p className="text-sm mt-1">All account enquiries have been successful</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Bank Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Attempt</TableHead>
                        <TableHead>Error Code</TableHead>
                        <TableHead>Error Message</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.map((err) => (
                        <TableRow key={err.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(err.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                              {err.bankCode}
                            </code>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {err.accountNumber.slice(0, 3)}****{err.accountNumber.slice(-3)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              #{err.attemptNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              {err.errorCode ?? "UNKNOWN"}
                            </code>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {err.errorMessage ?? "—"}
                          </TableCell>
                          <TableCell>
                            {err.resolvedAt ? (
                              <Badge variant="outline" className="text-green-600 border-green-300 gap-1 text-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                Resolved
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 text-xs">
                                <AlertTriangle className="w-3 h-3" />
                                Unresolved
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {/* Pagination */}
                  {errorTotal > ERROR_PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {errorPage * ERROR_PAGE_SIZE + 1}–{Math.min((errorPage + 1) * ERROR_PAGE_SIZE, errorTotal)} of {errorTotal}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setErrorPage(p => Math.max(0, p - 1))}
                          disabled={errorPage === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setErrorPage(p => p + 1)}
                          disabled={(errorPage + 1) * ERROR_PAGE_SIZE >= errorTotal}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
