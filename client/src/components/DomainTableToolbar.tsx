import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Search, X } from "lucide-react";
import type { DomainFilter } from "@/hooks/useDomainTable";

interface FilterOption {
  value: string;
  label: string;
}

interface ExtraFilter {
  key: string;
  placeholder: string;
  options: FilterOption[];
}

interface Props {
  filters: DomainFilter;
  setFilter: (key: string, value: string) => void;
  statusOptions: FilterOption[];
  extraFilters?: ExtraFilter[];
  onExportCSV: () => void;
  totalFiltered: number;
  totalAll: number;
}

export function DomainTableToolbar({
  filters,
  setFilter,
  statusOptions,
  extraFilters = [],
  onExportCSV,
  totalFiltered,
  totalAll,
}: Props) {
  const hasActiveFilters =
    filters.search || filters.status || filters.dateFrom || filters.dateTo ||
    extraFilters.some(ef => filters[ef.key]);

  const clearAll = () => {
    setFilter("search", "");
    setFilter("status", "");
    setFilter("dateFrom", "");
    setFilter("dateTo", "");
    extraFilters.forEach(ef => setFilter(ef.key, ""));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={filters.search}
            onChange={e => setFilter("search", e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Status filter */}
        <Select value={filters.status || "__all__"} onValueChange={v => setFilter("status", v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {statusOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Extra filters */}
        {extraFilters.map(ef => (
          <Select key={ef.key} value={filters[ef.key] || "__all__"} onValueChange={v => setFilter(ef.key, v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder={ef.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{ef.placeholder}</SelectItem>
              {ef.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {/* Date range */}
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={e => setFilter("dateFrom", e.target.value)}
          className="w-36 h-9 text-xs"
          title="From date"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={e => setFilter("dateTo", e.target.value)}
          className="w-36 h-9 text-xs"
          title="To date"
        />

        {/* Clear */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-9">
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" onClick={onExportCSV} className="h-9 ml-auto">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Result count */}
      <div className="text-xs text-muted-foreground">
        Showing {totalFiltered.toLocaleString()} of {totalAll.toLocaleString()} records
        {hasActiveFilters && " (filtered)"}
      </div>
    </div>
  );
}
