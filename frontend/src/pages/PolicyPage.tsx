import * as React from "react"
import { AlertCircle, RotateCcw, ShieldCheck } from "lucide-react"

import { api, type PolicyRules, type RiskLevel } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export function PolicyPage() {
  const [policy, setPolicy] = React.useState<PolicyRules | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadPolicy = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getPolicy()
      setPolicy(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policy rules")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadPolicy()
  }, [loadPolicy])

  if (loading) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-6">
        <header>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-80 mt-2" />
        </header>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Policy rules unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button size="sm" variant="outline" onClick={loadPolicy} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  const riskOrder: RiskLevel[] = ["BLOCKED", "HIGH", "MEDIUM", "LOW"]

  return (
    <div className="max-w-[1100px] w-full mr-auto space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-base font-medium text-foreground tracking-tight">Policy</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Active security rules, path traversal constraints, and command risk classifications.
        </p>
      </header>

      {/* Deterministic Guarantees Callout */}
      <div className="p-3 border border-border rounded-[6px] bg-card flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground font-mono">
            Note: Rules are deterministic. AI output never changes them.
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground/60 hidden sm:inline">
          Local enforcement
        </span>
      </div>

      {/* Rules Grouped by Risk Level */}
      {(!policy || !policy.risk_levels || Object.keys(policy.risk_levels).length === 0) ? (
        <div className="border border-border rounded-[6px] bg-card p-6 text-center text-xs text-muted-foreground">
          No policy rules loaded.
        </div>
      ) : (
        <div className="space-y-4">
          {riskOrder.map((risk) => {
            const description = policy?.risk_levels?.[risk] || ""
            const badgeVariant = risk.toLowerCase() as "low" | "medium" | "high" | "blocked"

            return (
              <div
                key={risk}
                className="border border-border rounded-[6px] bg-card p-4 space-y-2.5 transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={badgeVariant}>{risk}</Badge>
                    <span className="text-xs font-medium text-foreground">
                      {risk === "BLOCKED" && "Hard blocked · Never prompted to supervisor"}
                      {risk === "HIGH" && "High risk · Explicit approval required (session allow forbidden)"}
                      {risk === "MEDIUM" && "Medium risk · Supervisor approval required"}
                      {risk === "LOW" && "Low risk · Read-only inside workspace (auto-approved)"}
                    </span>
                  </div>
                </div>

                {/* Monospace Rule Block */}
                <div className="p-3 border border-border rounded-[4px] bg-muted/40 font-mono text-xs text-foreground leading-relaxed select-all">
                  <code>{description}</code>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* System Policy Parameters Table */}
      <div className="border border-border rounded-[6px] bg-card p-4 space-y-3">
        <h2 className="text-xs font-medium text-foreground">Security engine constraints</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-2.5 border border-border rounded-[4px] bg-muted/20">
            <dt className="text-muted-foreground text-[11px]">Unknown command fallback</dt>
            <dd className="text-foreground mt-0.5">Strictly defaults to HIGH, never LOW</dd>
          </div>

          <div className="p-2.5 border border-border rounded-[4px] bg-muted/20">
            <dt className="text-muted-foreground text-[11px]">Approval timeout</dt>
            <dd className="text-foreground mt-0.5 tabular-nums">120s expiry with automatic denial</dd>
          </div>

          <div className="p-2.5 border border-border rounded-[4px] bg-muted/20">
            <dt className="text-muted-foreground text-[11px]">Session allow policy</dt>
            <dd className="text-foreground mt-0.5">Enabled for MEDIUM; prohibited for HIGH</dd>
          </div>

          <div className="p-2.5 border border-border rounded-[4px] bg-muted/20">
            <dt className="text-muted-foreground text-[11px]">Secret sanitizer</dt>
            <dd className="text-foreground mt-0.5">API tokens, .env, keys redacted before audit & dispatch</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
