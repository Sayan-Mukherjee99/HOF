import * as React from "react"
import {
  Check,
  ChevronRight,
  Copy,
  Radio,
  KeyRound,
  ScrollText,
  Shield,
  Terminal,
  Activity,
  Layers,
} from "lucide-react"
import { toast } from "sonner"

import { useEventStream } from "@/hooks/useEventStream"
import { PairingPage } from "@/pages/PairingPage"
import { LiveSessionPage } from "@/pages/LiveSessionPage"
import { AuditLogPage } from "@/pages/AuditLogPage"
import { PolicyPage } from "@/pages/PolicyPage"
import { api, type AgentState } from "@/lib/api"
import { cn } from "@/lib/utils"
import { DataRain } from "@/components/ui/data-rain"

type ConsoleTab = "runtime" | "pairing" | "audit" | "policy"

const NAV_TABS: { id: ConsoleTab; label: string; number: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "runtime", label: "Runtime", number: "01", icon: Radio },
  { id: "pairing", label: "Pairing", number: "02", icon: KeyRound },
  { id: "audit", label: "Audit Log", number: "03", icon: ScrollText },
  { id: "policy", label: "Policy Engine", number: "04", icon: Shield },
]

export function DashboardApp() {
  const [activeTab, setActiveTab] = React.useState<ConsoleTab>("runtime")
  const { connectionState } = useEventStream()
  const [agentState, setAgentState] = React.useState<AgentState | null>(null)
  const [copiedPill, setCopiedPill] = React.useState(false)
  const [isConsoleHighlighted, setIsConsoleHighlighted] = React.useState(false)
  const scrollAnimationRef = React.useRef<number | null>(null)

  const consoleRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    api.getState().then(setAgentState).catch(() => {})
  }, [activeTab])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText("npx sutra-runtime@latest start")
      setCopiedPill(true)
      toast.success("Copied to clipboard: npx sutra-runtime@latest start")
      setTimeout(() => setCopiedPill(false), 2000)
    } catch {
      toast.error("Failed to copy command")
    }
  }

  const scrollToConsole = (tab?: ConsoleTab) => {
    if (tab) setActiveTab(tab)
    const targetEl = consoleRef.current
    if (!targetEl) return

    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current)
      scrollAnimationRef.current = null
    }

    const navOffset = 84
    const elementTop = targetEl.getBoundingClientRect().top
    const targetY = Math.max(0, elementTop + window.scrollY - navOffset)
    const startY = window.scrollY
    const distance = targetY - startY
    const duration = 850
    let startTime: number | null = null

    // Silky cubic-bezier / easeOutQuart physics
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)

    const step = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = easeOutQuart(progress)

      window.scrollTo(0, startY + distance * ease)

      if (progress < 1) {
        scrollAnimationRef.current = requestAnimationFrame(step)
      } else {
        scrollAnimationRef.current = null
        setIsConsoleHighlighted(true)
        setTimeout(() => setIsConsoleHighlighted(false), 1900)
      }
    }

    scrollAnimationRef.current = requestAnimationFrame(step)
  }

  return (
    <div className="min-h-screen bg-[#030305] text-white relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Full-site Ambient Data Rain Animation from 21st.dev */}
      <DataRain
        className="opacity-70"
        palette={{
          calm: "#06b6d4",
          mid: "#8a5cff",
          hot: "#ec4899",
        }}
      />

      {/* 48px Sub-pixel Grid Mesh */}
      <div className="absolute inset-0 bg-grid-mesh pointer-events-none opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Multi-layered Radial Glowing Holographic Aura */}
      <div className="absolute top-[160px] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] pointer-events-none -z-10 overflow-visible">
        {/* Iridescent Cyan (#06b6d4) */}
        <div className="absolute -top-10 -left-24 w-[480px] h-[380px] bg-[#06b6d4]/20 rounded-full blur-[120px] transform-gpu" />
        {/* Deep Fuchsia (#d946ef) */}
        <div className="absolute top-10 left-1/4 w-[500px] h-[400px] bg-[#d946ef]/18 rounded-full blur-[130px] transform-gpu" />
        {/* Ambient Amber (#f59e0b) */}
        <div className="absolute -bottom-10 right-8 w-[420px] h-[340px] bg-[#f59e0b]/14 rounded-full blur-[120px] transform-gpu" />
      </div>

      {/* Floating Glass Top-Navbar */}
      <nav className="fixed top-4 inset-x-0 z-50 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto h-12 rounded-full bg-[#07070b]/80 border border-white/10 backdrop-blur-xl px-4 sm:px-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex items-center justify-between pointer-events-auto">
          {/* Left: Brand Logo + Title + Version Pill */}
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-amber-400 p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-[5px] bg-[#07070b]">
                <span className="font-mono text-xs font-bold text-white">S</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-widest text-white">
                SŪTRA
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono tabular-nums text-zinc-400">
                v0.1.0
              </span>
            </div>
          </div>

          {/* Center: Monospace Minimal Navigation Links */}
          <div className="hidden md:flex items-center gap-1 border border-white/10 rounded-full p-1 bg-white/[0.03]">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => scrollToConsole(tab.id)}
                  className={cn(
                    "px-3 py-1 text-xs font-mono rounded-full transition-all duration-150 flex items-center gap-1.5",
                    isActive
                      ? "bg-white/15 text-white font-medium shadow-[0_0_12px_rgba(255,255,255,0.1)]"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <span className="text-[10px] text-zinc-500 tabular-nums">{tab.number}</span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Right: Live Status Badge + Launch Console Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-950/20 text-[11px] font-mono text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="hidden sm:inline">0 Inbound Ports</span>
              <span className="sm:hidden">0 Ports</span>
            </div>

            <button
              type="button"
              onClick={() => scrollToConsole("runtime")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#030305] text-xs font-mono font-medium hover:bg-zinc-200 transition-all duration-150 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              <span>Launch Console</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Hero Container */}
      <main className="relative pt-32 sm:pt-36 lg:pt-40 px-4 sm:px-6 max-w-7xl mx-auto pb-24">
        {/* Top Protocol Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/20 text-cyan-300 text-xs font-mono tracking-wide backdrop-blur-md shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)] animate-fade-slide-in-1">
            <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-cyan-400">[PROTOCOL]</span>
            <span>Local-First Outbound Agent Guardrails</span>
          </div>
        </div>

        {/* High-Impact Headline with Metallic & Iridescent Gradient */}
        <div className="text-center max-w-5xl mx-auto space-y-4 mb-6">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] font-sans animate-fade-slide-in-2">
            <span className="bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              Supervise Autonomous Coding{" "}
            </span>
            <span className="bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              Without Open Inbound Ports
            </span>
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-zinc-400 max-w-2xl mx-auto font-sans leading-relaxed pt-2 animate-fade-slide-in-3">
            Deterministic local interception, Telegram remote approvals, and tamper-evident
            SQLite WAL logging. Keep developer machines fully private while pairing with agents anywhere.
          </p>
        </div>

        {/* Interactive CTA Row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 mb-16 animate-fade-slide-in-4">
          {/* Interactive Click-to-Copy Terminal Pill */}
          <button
            type="button"
            onClick={copyCommand}
            className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/30 text-xs font-mono text-zinc-300 transition-all duration-150 backdrop-blur-md shadow-lg"
          >
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-zinc-400 select-none">$</span>
            <span className="text-zinc-100 font-medium select-all">npx sutra-runtime@latest start</span>
            <span className="ml-1 pl-2 border-l border-white/10 text-zinc-400 group-hover:text-white transition-colors">
              {copiedPill ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </span>
          </button>

          {/* Primary Button: Inspect Policy Engine */}
          <button
            type="button"
            onClick={() => scrollToConsole("policy")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 hover:from-cyan-500/30 hover:to-fuchsia-500/30 text-xs font-mono font-medium text-white transition-all duration-150 shadow-[0_0_25px_-5px_rgba(6,182,212,0.3)]"
          >
            <Shield className="h-3.5 w-3.5 text-cyan-400" />
            <span>Inspect Policy Engine</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          {/* Secondary Quick Jump */}
          <button
            type="button"
            onClick={() => scrollToConsole("runtime")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-transparent hover:bg-white/5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Live Session</span>
          </button>
        </div>

        {/* Central Holographic Core Console (Hero Artifact) */}
        <div ref={consoleRef} className="relative max-w-6xl mx-auto scroll-mt-24">
          {/* Ambient Glow Halo behind the core console */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/30 via-fuchsia-500/25 to-amber-500/20 blur-xl opacity-60 pointer-events-none" />

          {/* Frosted Holographic Glass Outer Frame */}
          <div
            className={cn(
              "relative rounded-2xl p-[1px] bg-gradient-to-b from-cyan-400/40 via-fuchsia-500/30 to-white/10 shadow-[0_0_80px_-20px_rgba(6,182,212,0.25)] transition-all duration-300",
              isConsoleHighlighted && "console-highlight-pulse ring-2 ring-cyan-400/60"
            )}
          >
            <div className="bg-[#07070b]/95 backdrop-blur-2xl rounded-2xl border border-white/10 overflow-hidden">
              {/* Terminal HUD Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10 bg-white/[0.02]">
                {/* Window LEDs + Console ID */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <div className="h-3.5 w-px bg-white/10" />
                  <span className="font-mono text-xs text-zinc-400 font-medium tracking-wide">
                    SŪTRA-CORE // LOCAL-SUPERVISION-V0.1.0
                  </span>
                </div>

                {/* Console Nav Tabs */}
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/10">
                  {NAV_TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-xs font-mono transition-all duration-150",
                          isActive
                            ? "bg-white/15 text-white font-medium shadow-[0_0_10px_rgba(255,255,255,0.15)]"
                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                        {tab.id === "runtime" && agentState?.status === "RUNNING" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Live Channel Indicator */}
                <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <span className="text-zinc-500">TRANSPORT:</span>
                  <span className="text-cyan-400">OUTBOUND WSS</span>
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                </div>
              </div>

              {/* Console Main Content Pane */}
              <div className="p-4 sm:p-6 bg-[#050508]/60">
                {activeTab === "runtime" && <LiveSessionPage />}
                {activeTab === "pairing" && <PairingPage />}
                {activeTab === "audit" && <AuditLogPage />}
                {activeTab === "policy" && <PolicyPage />}
              </div>

              {/* Bottom Holographic HUD Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 border-t border-white/10 bg-white/[0.02] text-xs font-mono">
                <div className="p-3.5 sm:px-5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Interception Latency</div>
                  <div className="text-white font-medium mt-0.5 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="tabular-nums">&lt; 1.0 ms</span>
                  </div>
                </div>

                <div className="p-3.5 sm:px-5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Inbound Public Ports</div>
                  <div className="text-white font-medium mt-0.5 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                    <span>0 (Zero Exposure)</span>
                  </div>
                </div>

                <div className="p-3.5 sm:px-5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Approval Transport</div>
                  <div className="text-white font-medium mt-0.5 flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-fuchsia-400" />
                    <span>Telegram Long-Poll</span>
                  </div>
                </div>

                <div className="p-3.5 sm:px-5">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Audit Security Log</div>
                  <div className="text-white font-medium mt-0.5 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-amber-400" />
                    <span>SQLite WAL Append-Only</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Global Footer */}
      <footer className="border-t border-white/10 bg-[#020204] py-8 px-4 sm:px-6 text-center text-xs font-mono text-zinc-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-300 font-bold">SŪTRA</span>
            <span>·</span>
            <span>Local-First Autonomous Coding Agent Runtime</span>
          </div>
          <div>
            <span>Status: </span>
            <span className="text-emerald-400 font-medium capitalize">{connectionState}</span>
            <span> · Built with FastAPI, SQLite WAL &amp; React</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default DashboardApp
