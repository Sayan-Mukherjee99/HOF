import * as React from "react"
import { Check, Copy, KeyRound, QrCode, RotateCcw, Smartphone, Unlink } from "lucide-react"
import { toast } from "sonner"

import { api, type AgentState, type PairingResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function PairingPage() {
  const [state, setState] = React.useState<AgentState | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  // Pairing code state
  const [pairingData, setPairingData] = React.useState<PairingResponse | null>(null)
  const [generating, setGenerating] = React.useState<boolean>(false)
  const [copied, setCopied] = React.useState<boolean>(false)
  const [countdown, setCountdown] = React.useState<number>(300)

  // Fetch agent & pairing state
  const loadState = React.useCallback(async () => {
    try {
      setError(null)
      const data = await api.getState()
      setState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load device status")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadState()
  }, [loadState])

  // Countdown timer for pairing code (5 min = 300s)
  React.useEffect(() => {
    if (!pairingData) return
    setCountdown(pairingData.expires_in_seconds)

    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [pairingData])

  // Generate pairing code
  const handleGenerateCode = async () => {
    setGenerating(true)
    try {
      const res = await api.createPairingCode()
      setPairingData(res)
      setCopied(false)
      toast.success("Pairing code generated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate pairing code")
    } finally {
      setGenerating(false)
    }
  }

  // Copy code to clipboard
  const handleCopyCode = async () => {
    if (!pairingData) return
    try {
      await navigator.clipboard.writeText(pairingData.pairing_code)
      setCopied(true)
      toast.success("Copied code to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy code")
    }
  }

  // Unpair device
  const handleUnpair = async () => {
    try {
      await api.unpair()
      toast.success("Device unpaired successfully")
      loadState()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unpair device")
    }
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  if (loading) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-6">
        <header>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-72 mt-2" />
        </header>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Device status unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button size="sm" variant="outline" onClick={loadState} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  const isPaired = Boolean(state?.is_paired)
  const pairedIdentifier = state?.paired_username
    ? `@${state.paired_username}`
    : state?.paired_chat_id
    ? `Chat ID: ${state.paired_chat_id}`
    : null

  return (
    <div className="max-w-[1100px] w-full mr-auto space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-base font-medium text-foreground tracking-tight">Pairing</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Authorize a remote device using a single-use pairing code.
        </p>
      </header>

      {/* Device Status Row */}
      <div className="border border-border rounded-[6px] bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-[4px] border border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  isPaired ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              />
              <span className="text-xs font-medium text-foreground">
                {isPaired ? (
                  <span>
                    Paired as <span className="font-mono tabular-nums text-foreground">{pairedIdentifier}</span>
                  </span>
                ) : (
                  "Not paired"
                )}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isPaired
                ? "This device receives approval requests and commands via Telegram."
                : "No supervisor device authorized. Generate a code below to pair."}
            </p>
          </div>
        </div>

        {isPaired && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleUnpair}
            className="h-7 text-xs gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive self-start sm:self-auto"
          >
            <Unlink className="h-3 w-3" /> Unpair
          </Button>
        )}
      </div>

      {/* Pairing Code Generator Section */}
      <div className="border border-border rounded-[6px] bg-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-xs font-medium text-foreground">One-time pairing code</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Codes expire after 5 minutes and can only be used once.
            </p>
          </div>
          <Button
            size="sm"
            disabled={generating}
            onClick={handleGenerateCode}
            className="h-8 text-xs gap-1.5 self-start sm:self-auto"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {generating ? "Generating..." : "Generate pairing code"}
          </Button>
        </div>

        {pairingData ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Code Monospace Box */}
              <div className="px-5 py-3 border border-border rounded-[4px] bg-muted/40 font-mono tabular-nums text-lg font-medium tracking-widest text-foreground select-all text-center">
                {pairingData.pairing_code}
              </div>

              {/* Copy Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyCode}
                className="h-8 text-xs gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-foreground" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy code"}
              </Button>

              {/* 5-minute countdown */}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {countdown > 0 ? `Expires in ${formatCountdown(countdown)}` : "Expired · Please generate new code"}
              </span>
            </div>

            {/* Instruction */}
            <div className="p-3 border border-border rounded-[4px] bg-muted/20 text-xs font-mono text-foreground space-y-1">
              <span className="text-muted-foreground block text-[11px]">Instruction:</span>
              <p className="select-all">Send /pair {pairingData.pairing_code} to your bot in Telegram.</p>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground">
            <QrCode className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs">No active pairing code.</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              Click &quot;Generate pairing code&quot; to authorize a supervisor device.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
