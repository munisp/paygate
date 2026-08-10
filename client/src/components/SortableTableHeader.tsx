import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/useDomainTable";

interface Props {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableTableHeader({ label, sortKey, currentSortKey, sortDir, onSort, className }: Props) {
  const isActive = currentSortKey === sortKey;
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/50 transition-colors", className)}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}
