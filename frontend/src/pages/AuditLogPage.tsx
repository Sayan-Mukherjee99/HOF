import * as React from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"

import { api, type AuditRecord, type RiskLevel } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AuditLogPage() {
  const [data, setData] = React.useState<AuditRecord[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  // Filters
  const [riskFilter, setRiskFilter] = React.useState<string>("ALL")
  const [decisionFilter, setDecisionFilter] = React.useState<string>("ALL")
  const [searchQuery, setSearchQuery] = React.useState<string>("")

  const fetchLogs = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const records = await api.getAudit({
        risk: riskFilter === "ALL" ? undefined : riskFilter,
        decision: decisionFilter === "ALL" ? undefined : decisionFilter,
        limit: 100,
      })
      setData(records)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit records")
    } finally {
      setLoading(false)
    }
  }, [riskFilter, decisionFilter])

  React.useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const columns = React.useMemo<ColumnDef<AuditRecord, any>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => {
          const raw = String(row.getValue("timestamp") || "")
          const formatted = raw ? new Date(raw).toLocaleTimeString([], { hour12: false }) : "-"
          return (
            <span className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
              {formatted}
            </span>
          )
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground whitespace-nowrap">
            {row.getValue("type")}
          </span>
        ),
      },
      {
        accessorKey: "risk",
        header: "Risk",
        cell: ({ row }) => {
          const risk = row.getValue("risk") as RiskLevel | null
          if (!risk) return <span className="text-muted-foreground/40 font-mono text-xs">-</span>
          const v = risk.toLowerCase() as "low" | "medium" | "high" | "blocked"
          return <Badge variant={v}>{risk}</Badge>
        },
      },
      {
        accessorKey: "command",
        header: "Command",
        cell: ({ row }) => {
          const cmd = String(row.getValue("command") || "")
          if (!cmd) return <span className="text-muted-foreground/40 font-mono text-xs">-</span>
          return (
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="font-mono text-xs text-foreground truncate max-w-[280px] inline-block align-middle cursor-default">
                    {cmd}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs max-w-sm break-all">
                  {cmd}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
      },
      {
        accessorKey: "decision",
        header: "Decision",
        cell: ({ row }) => {
          const dec = String(row.getValue("decision") || "")
          if (!dec) return <span className="text-muted-foreground/40 font-mono text-xs">-</span>
          const isAllow = dec.includes("ALLOW")
          return (
            <span
              className={`font-mono text-xs font-medium ${
                isAllow ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {dec}
            </span>
          )
        },
      },
      {
        accessorKey: "actor",
        header: "Actor",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground truncate max-w-[120px] inline-block">
            {row.getValue("actor") || "-"}
          </span>
        ),
      },
    ],
    []
  )

  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim()) return data
    const q = searchQuery.toLowerCase()
    return data.filter((item) =>
      item.command?.toLowerCase().includes(q) ||
      item.actor?.toLowerCase().includes(q) ||
      item.id?.toLowerCase().includes(q)
    )
  }, [data, searchQuery])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  return (
    <div className="max-w-[1100px] w-full mr-auto space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-base font-medium text-foreground tracking-tight">Audit log</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Append-only chronological record of security classifications, approvals, and actions.
        </p>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border border-border rounded-[6px] bg-card text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Risk Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Risk:</span>
            {["ALL", "LOW", "MEDIUM", "HIGH", "BLOCKED"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRiskFilter(r)}
                className={`px-2 py-0.5 rounded-[4px] font-mono text-[11px] transition-colors duration-150 ${
                  riskFilter === r
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="h-3 w-[1px] bg-border hidden sm:block" />

          {/* Decision Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Decision:</span>
            {["ALL", "ALLOW_AUTO", "ALLOW_ONCE", "ALLOW_SESSION", "DENY"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDecisionFilter(d)}
                className={`px-2 py-0.5 rounded-[4px] font-mono text-[11px] transition-colors duration-150 ${
                  decisionFilter === d
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="h-3 w-[1px] bg-border hidden md:block" />

          {/* Free-text Command Search */}
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              placeholder="Search command..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 w-44 px-2 text-[11px] font-mono placeholder:font-mono"
            />
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={fetchLogs}
          disabled={loading}
          className="h-6 text-[11px] gap-1 px-2"
        >
          <RotateCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load audit table</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Table Container */}
      <div className="border border-border rounded-[6px] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-8 px-3 text-xs font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="h-9">
                    <TableCell colSpan={columns.length} className="px-3 py-2">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="h-9 hover:bg-muted/20 border-b border-border/60 transition-colors duration-150"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-3 py-1.5 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-xs text-muted-foreground"
                  >
                    No audit records matching current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-3 border-t border-border text-xs text-muted-foreground font-mono">
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(1, table.getPageCount())} · {data.length} records
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 px-2 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 px-2 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
