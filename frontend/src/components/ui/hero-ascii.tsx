import * as React from "react"

declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized: boolean
      init?: () => void
    }
  }
}

interface HeroAsciiProps {
  onStartDemo?: () => void
  onInspectPolicy?: () => void
  onOpenPairing?: () => void
}

export function HeroAscii({ onStartDemo, onInspectPolicy, onOpenPairing }: HeroAsciiProps) {
  React.useEffect(() => {
    // 1. Inject UnicornStudio library if not already present
    if (!window.UnicornStudio) {
      window.UnicornStudio = { isInitialized: false }
      const script = document.createElement("script")
      script.type = "text/javascript"
      script.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.33/dist/unicornStudio.umd.js"
      script.onload = () => {
        if (!window.UnicornStudio?.isInitialized && window.UnicornStudio?.init) {
          window.UnicornStudio.init()
          window.UnicornStudio.isInitialized = true
        }
      }
      document.head.appendChild(script)
    } else if (window.UnicornStudio && window.UnicornStudio.init) {
      window.UnicornStudio.init()
    }

    // 2. Hide watermarks & set clipping
    const style = document.createElement("style")
    style.textContent = `
      [data-us-project] {
        position: relative !important;
        overflow: hidden !important;
      }
      [data-us-project] canvas {
        clip-path: inset(0 0 10% 0) !important;
      }
      [data-us-project] * {
        pointer-events: none !important;
      }
      [data-us-project] a[href*="unicorn"],
      [data-us-project] button[title*="unicorn"],
      [data-us-project] div[title*="Made with"],
      [data-us-project] .unicorn-brand,
      [data-us-project] [class*="brand"],
      [data-us-project] [class*="credit"],
      [data-us-project] [class*="watermark"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        position: absolute !important;
        left: -9999px !important;
        top: -9999px !important;
      }
    `
    document.head.appendChild(style)

    const hideBranding = () => {
      const container = document.querySelector("[data-us-project]")
      if (container) {
        container.querySelectorAll("*").forEach((el) => {
          const txt = (el.textContent || "").toLowerCase()
          if (txt.includes("made with") || txt.includes("unicorn")) {
            el.remove()
          }
        })
      }
    }
    hideBranding()
    const interval = setInterval(hideBranding, 150)

    return () => {
      clearInterval(interval)
      if (style.parentNode) document.head.removeChild(style)
    }
  }, [])

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-black text-white rounded-[6px] border border-border select-none">
      {/* 3D ASCII Canvas Layer (whwOGlfJ5Rz2rHaEUgHl) */}
      <div className="absolute inset-0 w-full h-full hidden lg:block opacity-75">
        <div
          data-us-project="whwOGlfJ5Rz2rHaEUgHl"
          style={{ width: "100%", height: "100%", minHeight: "100%" }}
        />
      </div>

      {/* Mobile / Fallback ASCII Grid Background */}
      <div className="absolute inset-0 w-full h-full lg:hidden bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />

      {/* Top HUD Technical Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 border-b border-white/20 bg-black/60 backdrop-blur-sm">
        <div className="px-4 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-white text-base font-bold tracking-widest uppercase">
              SŪTRA
            </span>
            <div className="h-3 w-px bg-white/40" />
            <span className="text-white/60 text-[10px] font-mono">
              LOCAL-FIRST RUNTIME
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-white/60">
            <span>BIND: 127.0.0.1:8000</span>
            <div className="w-1 h-1 bg-white/40 rounded-full" />
            <span>PORT: OUTBOUND ONLY</span>
            <div className="w-1 h-1 bg-white/40 rounded-full" />
            <span className="text-emerald-400">ENGINE: ACTIVE</span>
          </div>
        </div>
      </div>

      {/* 4 Corner HUD Crosshair Brackets */}
      <div className="absolute top-0 left-0 w-6 h-6 lg:w-10 lg:h-10 border-t-2 border-l-2 border-white/40 z-20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-6 h-6 lg:w-10 lg:h-10 border-t-2 border-r-2 border-white/40 z-20 pointer-events-none" />
      <div className="absolute bottom-12 left-0 w-6 h-6 lg:w-10 lg:h-10 border-b-2 border-l-2 border-white/40 z-20 pointer-events-none" />
      <div className="absolute bottom-12 right-0 w-6 h-6 lg:w-10 lg:h-10 border-b-2 border-r-2 border-white/40 z-20 pointer-events-none" />

      {/* Main Hero Content Area */}
      <div className="relative z-10 flex min-h-[calc(100vh-6rem)] items-center px-6 lg:px-16 pt-16 pb-16">
        <div className="max-w-xl">
          {/* Section Marker */}
          <div className="flex items-center gap-2 mb-4 opacity-70">
            <div className="w-8 h-px bg-white" />
            <span className="text-white text-[10px] font-mono tracking-widest">
              SEC.001 · SUPERVISION BARRIER
            </span>
            <div className="flex-1 h-px bg-white/40" />
          </div>

          {/* Heading */}
          <div className="relative mb-4">
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight font-mono tracking-wider"
              style={{ letterSpacing: "0.08em" }}
            >
              REMOTE CODING
              <span className="block text-white/90 mt-1">SUPERVISION</span>
            </h1>
          </div>

          {/* Micro HUD Dots */}
          <div className="hidden lg:flex gap-1 mb-4 opacity-50">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />
            ))}
          </div>

          {/* Subtitle */}
          <p className="text-xs sm:text-sm text-zinc-300 mb-6 leading-relaxed font-mono opacity-85">
            Supervise autonomous coding agents remotely without public inbound ports. Deterministic
            policy engine with Telegram out-of-band approvals and SQLite WAL audit logging.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onStartDemo}
              className="relative px-5 py-2.5 bg-white text-black font-mono text-xs font-medium border border-white hover:bg-zinc-200 transition-colors duration-150 flex items-center justify-center gap-2 rounded-[4px]"
            >
              START LIVE DEMO
            </button>

            <button
              type="button"
              onClick={onInspectPolicy}
              className="relative px-5 py-2.5 bg-transparent border border-white/60 text-white font-mono text-xs hover:border-white hover:bg-white/10 transition-colors duration-150 flex items-center justify-center gap-2 rounded-[4px]"
            >
              INSPECT POLICY
            </button>

            <button
              type="button"
              onClick={onOpenPairing}
              className="relative px-5 py-2.5 bg-transparent border border-white/40 text-zinc-300 font-mono text-xs hover:text-white hover:border-white/80 transition-colors duration-150 flex items-center justify-center gap-2 rounded-[4px]"
            >
              PAIR TELEGRAM
            </button>
          </div>

          {/* Vitruvian Footer Notation */}
          <div className="hidden lg:flex items-center gap-2 mt-8 opacity-40">
            <span className="text-white text-[10px] font-mono">∞</span>
            <div className="flex-1 h-px bg-white" />
            <span className="text-white text-[10px] font-mono tracking-widest">
              LOCAL-FIRST · OUTBOUND-ONLY
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Technical Telemetry Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/20 bg-black/70 backdrop-blur-sm">
        <div className="px-4 lg:px-8 py-2.5 flex items-center justify-between text-[10px] font-mono text-white/60">
          <div className="flex items-center gap-4">
            <span>SYSTEM.ACTIVE</span>
            <div className="hidden sm:flex gap-1 items-end h-3">
              {[8, 14, 6, 12, 10, 16, 8, 14].map((h, i) => (
                <div key={i} className="w-1 bg-white/40" style={{ height: `${h}px` }} />
              ))}
            </div>
            <span>V0.1.0</span>
          </div>

          <div className="flex items-center gap-3">
            <span>◐ REALTIME WS</span>
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
