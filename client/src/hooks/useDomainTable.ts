import { useState, useMemo, useCallback } from "react";

export type SortDir = "asc" | "desc";

export interface DomainFilter {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

export function useDomainTable<T extends Record<string, any>>(
  data: T[],
  searchFields: (keyof T)[],
  defaultSort?: keyof T
) {
  const [filters, setFilters] = useState<DomainFilter>({
    search: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSort ?? null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const setFilter = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const toggleSort = useCallback((key: keyof T) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return key;
      }
      setSortDir("desc");
      return key;
    });
    setPage(1);
  }, []);

  const filtered = useMemo(() => {
    let result = [...data];

    // Text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(row =>
        searchFields.some(f => String(row[f] ?? "").toLowerCase().includes(q))
      );
    }

    // Status filter
    if (filters.status) {
      result = result.filter(row =>
        String(row.status ?? row.state ?? "").toLowerCase() === filters.status.toLowerCase()
      );
    }

    // Date range
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      result = result.filter(row => {
        const d = new Date(row.created_at ?? row.createdAt ?? row.date ?? 0).getTime();
        return d >= from;
      });
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86400000;
      result = result.filter(row => {
        const d = new Date(row.created_at ?? row.createdAt ?? row.date ?? 0).getTime();
        return d <= to;
      });
    }

    // Extra filters (currency, disco, program_type, etc.)
    Object.entries(filters).forEach(([key, value]) => {
      if (["search", "status", "dateFrom", "dateTo"].includes(key)) return;
      if (!value) return;
      result = result.filter(row =>
        String(row[key] ?? "").toLowerCase() === value.toLowerCase()
      );
    });

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [data, filters, sortKey, sortDir, searchFields]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const exportCSV = useCallback((columns: { key: string; label: string }[]) => {
    const header = columns.map(c => c.label).join(",");
    const rows = filtered.map(row =>
      columns.map(c => {
        const val = row[c.key] ?? "";
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") ? `"${str}"` : str;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return {
    filters,
    setFilter,
    sortKey,
    sortDir,
    toggleSort,
    filtered,
    paginated,
    page,
    setPage,
    totalPages,
    exportCSV,
  };
}
