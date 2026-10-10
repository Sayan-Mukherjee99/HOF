import * as React from "react"
import {
  AlertCircle,
  ArrowDown,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Square,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"

import {
  api,
  type AgentState,
  type ApprovalRequest,
  type SutraEvent,
} from "@/lib/api"
import { useEventStream } from "@/hooks/useEventStream"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Timeline,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@/components/ui/timeline"

interface LogEntry {
  id: string
  time: string
  text: string
  type: string
}

export function LiveSessionPage() {
  const { connectionState, lastEvent } = useEventStream()

  const [state, setState] = React.useState<AgentState | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  // Timeline events & log lines state
  const [timelineEvents, setTimelineEvents] = React.useState<SutraEvent[]>([])
  const [logs, setLogs] = React.useState<LogEntry[]>([])

  // Session elapsed timer
  const [startTime, setStartTime] = React.useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0)

  // Auto-scroll control
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const [isScrolledUp, setIsScrolledUp] = React.useState<boolean>(false)

  // Fetch initial state
  const fetchState = React.useCallback(async () => {
    try {
      setError(null)
      const data = await api.getState()
      setState(data)
      if (data.status === "RUNNING" && !startTime) {
        setStartTime(Date.now())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent state")
    } finally {
      setLoading(false)
    }
  }, [startTime])

  React.useEffect(() => {
    fetchState()
  }, [fetchState])

  // Process live events from WebSocket
  React.useEffect(() => {
    if (!lastEvent) return

    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })

    // Add to timeline if notable event
    if (
      [
        "AGENT_STARTED",
        "PERMISSION_REQUIRED",
        "DECISION",
        "AGENT_PAUSED",
        "AGENT_RESUMED",
        "AGENT_STOPPED",
        "STEER",
        "PROGRESS",
      ].includes(lastEvent.type)
    ) {
      setTimelineEvents((prev) => [lastEvent, ...prev.slice(0, 49)])
    }

    // Add to log viewer
    if (lastEvent.type === "LOG" && typeof lastEvent.payload?.message === "string") {
      setLogs((prev) => [
        ...prev,
        {
          id: lastEvent.id,
          time: timeStr,
          text: String(lastEvent.payload.message),
          type: "LOG",
        },
      ])
    } else if (lastEvent.type === "PERMISSION_REQUIRED") {
      setLogs((prev) => [
        ...prev,
        {
          id: lastEvent.id,
          time: timeStr,
          text: `[AUTH] Permission required: ${lastEvent.payload?.command}`,
          type: "AUTH",
        },
      ])
    } else if (lastEvent.type === "DECISION") {
      setLogs((prev) => [
        ...prev,
        {
          id: lastEvent.id,
          time: timeStr,
          text: `[DECISION] ${lastEvent.payload?.decision} on ${lastEvent.payload?.command}`,
          type: "DECISION",
        },
      ])
    }

    // Refresh state when lifecycle or permission changes
    if (
      ["AGENT_STARTED", "PERMISSION_REQUIRED", "DECISION", "AGENT_PAUSED", "AGENT_RESUMED", "AGENT_STOPPED"].includes(
        lastEvent.type
      )
    ) {
      fetchState()
    }
  }, [lastEvent, fetchState])

  // Elapsed timer tick
  React.useEffect(() => {
    if (state?.status !== "RUNNING") return
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [state?.status])

  // Agent action handlers
  const handleAgentControl = async (action: "start" | "pause" | "resume" | "stop") => {
    try {
      await api.controlAgent(action)
      toast.success(`Agent ${action} command dispatched`)
      fetchState()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} agent`)
    }
  }

  // Scroll handler for log viewer
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const diff = target.scrollHeight - target.scrollTop - target.clientHeight
    setIsScrolledUp(diff > 40)
  }

  const scrollToBottom = () => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight
      setIsScrolledUp(false)
    }
  }

  React.useEffect(() => {
    if (!isScrolledUp && scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight
    }
  }, [logs, isScrolledUp])

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Active pending approval
  const activeApproval = state?.pending_approvals?.[0] || null

  if (loading) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-6">
        <header>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64 mt-2" />
        </header>
        <div className="p-4 border border-border rounded-[6px] flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[1100px] w-full mr-auto space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection failure</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button size="sm" variant="outline" onClick={fetchState} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  const statusColor = {
    RUNNING: "bg-emerald-500",
    PAUSED: "bg-amber-500",
    STOPPED: "bg-zinc-500",
    COMPLETED: "bg-zinc-500",
    IDLE: "bg-zinc-600",
  }[state?.status || "IDLE"]

  return (
    <div className="max-w-[1100px] w-full mr-auto space-y-6">
      {/* Page Header */}
      <header>
        <h1 className="text-base font-medium text-foreground tracking-tight">Live session</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Supervise autonomous coding agent activity and pending approvals in real time.
        </p>
      </header>

      {/* System Alerts */}
      {connectionState === "disconnected" && (
        <Alert variant="destructive" className="py-2.5">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Backend disconnected</AlertTitle>
          <AlertDescription className="text-xs">
            Lost WebSocket connection to http://127.0.0.1:8000. Retrying automatically.
          </AlertDescription>
        </Alert>
      )}

      {state && !state.is_paired && (
        <Alert className="py-2.5 border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Telegram supervisor not connected</AlertTitle>
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-300/80">
            No mobile device is paired. Navigate to Pairing to authorize your phone.
          </AlertDescription>
        </Alert>
      )}

      {/* Top Status & Lifecycle Control Row */}
      <div className="border border-border rounded-[6px] bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
          {/* Status Dot + Text */}
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
            <span className="font-mono text-xs uppercase tracking-wider text-foreground font-medium">
              {state?.status || "IDLE"}
            </span>
          </div>

          <div className="hidden sm:block h-3.5 w-[1px] bg-border" />

          {/* Current Task */}
          <div className="min-w-0 text-xs">
            <span className="text-muted-foreground mr-1.5">Task:</span>
            <span className="text-foreground truncate font-mono">
              {state?.current_task || "No active task"}
            </span>
          </div>

          <div className="hidden sm:block h-3.5 w-[1px] bg-border" />

          {/* Elapsed Time */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums">
            <Clock className="h-3 w-3" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {(state?.status === "IDLE" || state?.status === "STOPPED" || state?.status === "COMPLETED") && (
            <Button
              size="sm"
              onClick={() => handleAgentControl("start")}
              className="h-7 text-xs gap-1"
            >
              <Play className="h-3 w-3" /> Start demo
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={state?.status !== "RUNNING"}
            onClick={() => handleAgentControl("pause")}
            className="h-7 text-xs gap-1"
          >
            <Pause className="h-3 w-3" /> Pause
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={state?.status !== "PAUSED"}
            onClick={() => handleAgentControl("resume")}
            className="h-7 text-xs gap-1"
          >
            <Play className="h-3 w-3" /> Resume
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={state?.status === "STOPPED" || state?.status === "IDLE" || state?.status === "COMPLETED"}
            onClick={() => handleAgentControl("stop")}
            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Square className="h-3 w-3" /> Stop
          </Button>
        </div>
      </div>

      {/* Pending Approval Card */}
      {activeApproval && (
        <PendingApprovalCard
          approval={activeApproval}
          onDecision={() => fetchState()}
        />
      )}

      {/* Two-Column Layout: Timeline (Left) & Log Viewer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Vertical Timeline */}
        <div className="border border-border rounded-[6px] bg-card p-4 flex flex-col h-[480px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
            <h2 className="text-xs font-medium text-foreground tracking-tight">Execution timeline</h2>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {timelineEvents.length} events
            </span>
          </div>

          {timelineEvents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <span className="text-xs">No events recorded for this session yet.</span>
              <span className="text-[11px] mt-1 text-muted-foreground/60">
                Timeline updates as the agent proceeds through stages.
              </span>
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-3">
              <Timeline>
                {timelineEvents.map((evt) => {
                  const time = new Date(evt.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })

                  let title = evt.type.replace(/_/g, " ").toLowerCase()
                  title = title.charAt(0).toUpperCase() + title.slice(1)
                  let dotVariant: "default" | "low" | "medium" | "high" | "blocked" = "default"
                  let description = ""

                  if (evt.type === "PERMISSION_REQUIRED") {
                    title = "Permission requested"
                    description = String(evt.payload?.command || "")
                    const r = String(evt.payload?.risk || "").toLowerCase()
                    if (r === "low" || r === "medium" || r === "high" || r === "blocked") {
                      dotVariant = r
                    }
                  } else if (evt.type === "DECISION") {
                    const dec = String(evt.payload?.decision || "")
                    title = `Decision: ${dec}`
                    description = `${evt.payload?.command || ""} (by ${evt.payload?.actor || "supervisor"})`
                    dotVariant = dec.includes("ALLOW") ? "low" : "high"
                  } else if (evt.type === "AGENT_STARTED") {
                    title = "Task started"
                    description = String(evt.payload?.task || "")
                  } else if (evt.type === "PROGRESS") {
                    title = `Progress · ${evt.payload?.percent}%`
                    description = String(evt.payload?.stage || "")
                  }

                  return (
                    <TimelineItem key={evt.id}>
                      <TimelineDot variant={dotVariant} />
                      <TimelineHeader>
                        <TimelineTitle>{title}</TimelineTitle>
                        <TimelineTime>{time}</TimelineTime>
                      </TimelineHeader>
                      {description && (
                        <TimelineDescription className="font-mono truncate">
                          {description}
                        </TimelineDescription>
                      )}
                    </TimelineItem>
                  )
                })}
              </Timeline>
            </ScrollArea>
          )}
        </div>

        {/* Right: Log Viewer */}
        <div className="border border-border rounded-[6px] bg-card p-4 flex flex-col h-[480px] relative">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
            <h2 className="text-xs font-medium text-foreground tracking-tight">Agent logs</h2>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {logs.length} lines
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <span className="text-xs">No output received.</span>
              <span className="text-[11px] mt-1 text-muted-foreground/60">
                Log lines will stream here via WebSocket.
              </span>
            </div>
          ) : (
            <div
              ref={scrollViewportRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[13px] leading-relaxed pr-2"
            >
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-foreground/90 hover:bg-muted/30 px-1 rounded-[2px]">
                  <span className="text-muted-foreground/50 text-xs shrink-0 select-none tabular-nums">
                    {log.time}
                  </span>
                  <span className="break-all whitespace-pre-wrap">{log.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Jump to Latest Floating Button */}
          {isScrolledUp && (
            <Button
              size="sm"
              variant="secondary"
              onClick={scrollToBottom}
              className="absolute bottom-6 right-6 h-7 text-xs gap-1 border border-border shadow-none"
            >
              Jump to latest <ArrowDown className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function useRef<T>(initialValue: T): React.MutableRefObject<T> {
  return React.useRef(initialValue)
}

// ============================================================================
// PENDING APPROVAL CARD COMPONENT
// ============================================================================

interface PendingApprovalCardProps {
  approval: ApprovalRequest
  onDecision: () => void
}

function PendingApprovalCard({ approval, onDecision }: PendingApprovalCardProps) {
  const [submitting, setSubmitting] = React.useState<boolean>(false)
  const [timeLeft, setTimeLeft] = React.useState<number>(() => {
    const remaining = Math.max(0, Math.floor(approval.expires_at - Date.now() / 1000))
    return remaining
  })

  // 120s Countdown timer
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor(approval.expires_at - Date.now() / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        window.clearInterval(timer)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [approval.expires_at])

  const isExpired = timeLeft <= 0

  const handleDecision = React.useCallback(
    async (decision: "ALLOW_ONCE" | "ALLOW_SESSION" | "DENY") => {
      if (isExpired || submitting) return
      setSubmitting(true)
      try {
        await api.submitDecision(approval.id, decision)
        toast.success(`Registered decision: ${decision}`)
        onDecision()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to record decision")
      } finally {
        setSubmitting(false)
      }
    },
    [approval.id, isExpired, submitting, onDecision]
  )

  // Keyboard shortcuts: A (Allow once), S (Allow session), D (Deny)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        handleDecision("ALLOW_ONCE")
      } else if ((e.key === "s" || e.key === "S") && approval.risk !== "HIGH") {
        e.preventDefault()
        handleDecision("ALLOW_SESSION")
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault()
        handleDecision("DENY")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleDecision, approval.risk])

  const riskVariant = approval.risk.toLowerCase() as "low" | "medium" | "high" | "blocked"

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-xs font-medium text-foreground">
            Permission required
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">{approval.reason}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={riskVariant}>{approval.risk}</Badge>
          <span
            className={`font-mono text-xs tabular-nums ${
              timeLeft < 20 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
            }`}
          >
            {isExpired ? "00:00" : `${timeLeft}s`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="p-3 rounded-[4px] border border-border bg-muted/40 font-mono text-xs text-foreground overflow-x-auto select-all">
          <code>{approval.command}</code>
        </div>

        {isExpired && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              Approval expired after 120s. Permission was automatically denied.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2 pt-0">
        <Button
          size="sm"
          variant="destructive"
          disabled={isExpired || submitting}
          onClick={() => handleDecision("DENY")}
          className="h-7 text-xs"
        >
          Deny
          <kbd className="text-[10px] bg-destructive-foreground/20 px-1 py-0.5 rounded-[4px] ml-1.5 font-mono">
            D
          </kbd>
        </Button>

        {approval.risk !== "HIGH" && (
          <Button
            size="sm"
            variant="outline"
            disabled={isExpired || submitting}
            onClick={() => handleDecision("ALLOW_SESSION")}
            className="h-7 text-xs"
          >
            Allow session
            <kbd className="text-[10px] bg-muted px-1 py-0.5 rounded-[4px] ml-1.5 font-mono">
              S
            </kbd>
          </Button>
        )}

        <Button
          size="sm"
          disabled={isExpired || submitting}
          onClick={() => handleDecision("ALLOW_ONCE")}
          className="h-7 text-xs"
        >
          Allow once
          <kbd className="text-[10px] bg-primary-foreground/20 px-1 py-0.5 rounded-[4px] ml-1.5 font-mono">
            A
          </kbd>
        </Button>
      </CardFooter>
    </Card>
  )
}
