import * as React from "react"
import {
  Compass,
  KeyRound,
  Radio,
  ScrollText,
  Shield,
  Smartphone,
} from "lucide-react"

import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarToggle,
  useSidebar,
  CountBadge,
} from "@/components/ui/wensity-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useEventStream, type ConnectionState } from "@/hooks/useEventStream"
import { PairingPage } from "@/pages/PairingPage"
import { LiveSessionPage } from "@/pages/LiveSessionPage"
import { AuditLogPage } from "@/pages/AuditLogPage"
import { PolicyPage } from "@/pages/PolicyPage"
import { ResponsiveHeroBanner } from "@/components/ui/responsive-hero-banner"
import { api, type AgentState } from "@/lib/api"

type NavTab = "hero" | "live" | "pairing" | "audit" | "policy"

function WorkspaceMark() {
  const { collapsed } = useSidebar()

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-primary text-xs font-mono font-bold text-primary-foreground">
        S
      </div>
      {!collapsed && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-xs font-mono font-bold tracking-wider text-foreground">
            SŪTRA
          </span>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            v0.1.0
          </span>
        </div>
      )}
    </div>
  )
}

function ConnectionFooter({
  connectionState,
  agentState,
}: {
  connectionState: ConnectionState
  agentState: AgentState | null
}) {
  const { collapsed } = useSidebar()

  const dotColor = {
    connected: "bg-emerald-500",
    connecting: "bg-amber-500",
    disconnected: "bg-red-500",
  }[connectionState]

  const isPaired = Boolean(agentState?.is_paired)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 text-xs font-mono text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          {!collapsed && (
            <span className="truncate capitalize text-[11px] tabular-nums">
              {connectionState}
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        )}
      </div>

      {!collapsed && isPaired && (
        <div className="flex items-center gap-2 px-1 text-[11px] font-mono text-muted-foreground">
          <Smartphone className="h-3 w-3 shrink-0" />
          <span className="truncate text-foreground">
            {agentState?.paired_username
              ? `@${agentState.paired_username}`
              : `ID: ${agentState?.paired_chat_id}`}
          </span>
        </div>
      )}

      {collapsed && (
        <div className="flex justify-center pt-1">
          <ThemeToggle />
        </div>
      )}
    </div>
  )
}

function DashboardApp() {
  const [activeTab, setActiveTab] = React.useState<NavTab>("live")
  const { connectionState } = useEventStream()
  const [agentState, setAgentState] = React.useState<AgentState | null>(null)

  React.useEffect(() => {
    api.getState().then(setAgentState).catch(() => {})
  }, [activeTab])

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Navigation Section using @wensity/components/sidebar */}
      <Sidebar defaultCollapsed={false} width={232} collapsedWidth={60}>
        <SidebarHeader>
          <WorkspaceMark />
          <SidebarToggle />
        </SidebarHeader>

        <SidebarNav>
          <SidebarSection label="Platform">
            <SidebarItem
              icon={<Compass className="h-4 w-4" />}
              active={activeTab === "hero"}
              onClick={() => setActiveTab("hero")}
            >
              Hero Overview
            </SidebarItem>
          </SidebarSection>

          <SidebarSection label="Supervision">
            <SidebarItem
              icon={<Radio className="h-4 w-4" />}
              active={activeTab === "live"}
              badge={
                agentState?.status === "RUNNING" ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <CountBadge>{agentState?.status || "IDLE"}</CountBadge>
                )
              }
              onClick={() => setActiveTab("live")}
            >
              Live session
            </SidebarItem>

            <SidebarItem
              icon={<KeyRound className="h-4 w-4" />}
              active={activeTab === "pairing"}
              badge={
                agentState?.is_paired ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ) : undefined
              }
              onClick={() => setActiveTab("pairing")}
            >
              Pairing
            </SidebarItem>
          </SidebarSection>

          <SidebarSection label="Security & Policy">
            <SidebarItem
              icon={<ScrollText className="h-4 w-4" />}
              active={activeTab === "audit"}
              onClick={() => setActiveTab("audit")}
            >
              Audit log
            </SidebarItem>

            <SidebarItem
              icon={<Shield className="h-4 w-4" />}
              active={activeTab === "policy"}
              onClick={() => setActiveTab("policy")}
            >
              Policy
            </SidebarItem>
          </SidebarSection>
        </SidebarNav>

        <SidebarFooter>
          <ConnectionFooter
            connectionState={connectionState}
            agentState={agentState}
          />
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Pane */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {activeTab === "hero" ? (
          <div className="p-4 lg:p-6">
            <ResponsiveHeroBanner
              badgeLabel="Protocol"
              badgeText="Local-First Agent Supervision Runtime · SŪTRA v0.1.0"
              title="Supervise Autonomous Coding"
              titleLine2="Without Public Inbound Ports"
              description="Local-first outbound-only security guardrails for AI coding agents. Intercept dangerous commands against deterministic policies, approve actions remotely via Telegram, and audit execution with SQLite WAL logging."
              primaryButtonText="Launch Live Supervision"
              onPrimaryClick={() => setActiveTab("live")}
              secondaryButtonText="Inspect Security Policy"
              onSecondaryClick={() => setActiveTab("policy")}
              ctaButtonText="Start Demo"
              onCtaClick={() => setActiveTab("live")}
              navLinks={[
                { label: "Live session", onClick: () => setActiveTab("live") },
                { label: "Pairing", onClick: () => setActiveTab("pairing") },
                { label: "Audit log", onClick: () => setActiveTab("audit") },
                { label: "Policy", onClick: () => setActiveTab("policy") },
              ]}
            />
          </div>
        ) : (
          <div className="p-6">
            {activeTab === "live" && <LiveSessionPage />}
            {activeTab === "pairing" && <PairingPage />}
            {activeTab === "audit" && <AuditLogPage />}
            {activeTab === "policy" && <PolicyPage />}
          </div>
        )}
      </main>
    </div>
  )
}

export default DashboardApp
