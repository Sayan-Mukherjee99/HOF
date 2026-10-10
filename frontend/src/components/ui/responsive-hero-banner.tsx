import * as React from "react"
import { ArrowUpRight, ArrowRight, Play, Menu, X, Shield, Terminal, Database, Send, Cpu } from "lucide-react"

export interface NavLinkItem {
  label: string
  href?: string
  isActive?: boolean
  onClick?: () => void
}

export interface PartnerItem {
  name: string
  icon?: React.ReactNode
  logoUrl?: string
  href?: string
}

export interface ResponsiveHeroBannerProps {
  logoUrl?: string
  backgroundImageUrl?: string
  navLinks?: NavLinkItem[]
  ctaButtonText?: string
  onCtaClick?: () => void
  badgeLabel?: string
  badgeText?: string
  title?: string
  titleLine2?: string
  description?: string
  primaryButtonText?: string
  onPrimaryClick?: () => void
  secondaryButtonText?: string
  onSecondaryClick?: () => void
  partnersTitle?: string
  partners?: PartnerItem[]
}

const DEFAULT_BG =
  "https://cdn.21st.dev/assets/mirror/a8/a8cf38f65f7315f95eba8c803c4a80a9d78cb2ea36fbfee49828396e4a0b9737.jpg"

const DEFAULT_PARTNERS: PartnerItem[] = [
  { name: "Python 3.11", icon: <Terminal className="h-4 w-4" /> },
  { name: "FastAPI", icon: <Cpu className="h-4 w-4" /> },
  { name: "SQLite WAL", icon: <Database className="h-4 w-4" /> },
  { name: "Telegram Bot", icon: <Send className="h-4 w-4" /> },
  { name: "Policy Engine", icon: <Shield className="h-4 w-4" /> },
]

export function ResponsiveHeroBanner({
  backgroundImageUrl = DEFAULT_BG,
  navLinks,
  ctaButtonText = "Live Session",
  onCtaClick,
  badgeLabel = "New",
  badgeText = "Local-First Agent Supervision Protocol · SŪTRA v0.1.0",
  title = "Supervise Autonomous Coding",
  titleLine2 = "Without Public Inbound Ports",
  description = "A remote supervision runtime for local AI agents. Intercept commands against deterministic security barriers, approve actions via Telegram, and audit execution with tamper-evident SQLite logging.",
  primaryButtonText = "Launch Live Supervision",
  onPrimaryClick,
  secondaryButtonText = "Inspect Security Policy",
  onSecondaryClick,
  partnersTitle = "Built with deterministic, local-first protocols",
  partners = DEFAULT_PARTNERS,
}: ResponsiveHeroBannerProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  return (
    <section className="w-full isolate min-h-[calc(100vh-3rem)] overflow-hidden relative rounded-[6px] border border-border select-none bg-black text-white">
      {/* Background Image with Ambient Darkness Overlays */}
      <img
        src={backgroundImageUrl}
        alt="Hero background"
        className="w-full h-full object-cover absolute inset-0 brightness-[0.4] contrast-[1.1]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/70" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10" />

      {/* Glassmorphic Navigation Header */}
      <header className="z-20 relative pt-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo / Brand Mark */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-white text-black font-mono font-bold text-sm tracking-wider">
              S
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-sm font-bold tracking-widest text-white leading-none">
                SŪTRA
              </span>
              <span className="text-[10px] font-mono text-white/60 tracking-wider">
                RUNTIME
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/15 backdrop-blur-md">
              {navLinks?.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={item.onClick}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full font-sans transition-colors duration-150 ${
                    item.isActive
                      ? "text-white bg-white/15"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}

              {onCtaClick && (
                <button
                  type="button"
                  onClick={onCtaClick}
                  className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white/90 font-sans transition-colors duration-150"
                >
                  {ctaButtonText}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </nav>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur text-white"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 p-3 rounded-[6px] bg-black/90 ring-1 ring-white/20 backdrop-blur-xl space-y-2">
            {navLinks?.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  item.onClick?.()
                  setMobileMenuOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-[4px] transition-colors ${
                  item.isActive
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            ))}
            {onCtaClick && (
              <button
                type="button"
                onClick={() => {
                  onCtaClick()
                  setMobileMenuOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-white text-neutral-900 rounded-[4px]"
              >
                {ctaButtonText}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Hero Body */}
      <div className="z-10 relative">
        <div className="sm:pt-20 md:pt-24 lg:pt-28 max-w-7xl mx-auto pt-16 px-6 pb-20">
          <div className="mx-auto max-w-4xl text-center">
            {/* Animated Pill Badge */}
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15 backdrop-blur-md animate-fade-slide-in-1">
              <span className="inline-flex items-center text-[11px] font-semibold text-neutral-900 bg-white/95 rounded-full py-0.5 px-2 font-mono uppercase tracking-wider">
                {badgeLabel}
              </span>
              <span className="text-xs font-medium text-white/90 font-mono tracking-wide">
                {badgeText}
              </span>
            </div>

            {/* Headline with Instrument Serif Font */}
            <h1 className="sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08] text-4xl text-white tracking-tight font-instrument-serif font-normal animate-fade-slide-in-2">
              {title}
              {titleLine2 && (
                <>
                  <br className="hidden sm:block" />
                  <span className="text-white/95">{titleLine2}</span>
                </>
              )}
            </h1>

            {/* Description Subtitle */}
            <p className="sm:text-base md:text-lg animate-fade-slide-in-3 text-sm text-white/80 max-w-2xl mt-6 mx-auto font-sans leading-relaxed">
              {description}
            </p>

            {/* Dual CTA Buttons */}
            <div className="flex flex-col sm:flex-row sm:gap-4 mt-10 gap-3 items-center justify-center animate-fade-slide-in-4">
              {onPrimaryClick && (
                <button
                  type="button"
                  onClick={onPrimaryClick}
                  className="inline-flex items-center gap-2 hover:bg-white/20 text-xs sm:text-sm font-medium text-white bg-white/10 ring-white/20 ring-1 rounded-full py-3 px-6 font-mono transition-all duration-150 shadow-none"
                >
                  {primaryButtonText}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}

              {onSecondaryClick && (
                <button
                  type="button"
                  onClick={onSecondaryClick}
                  className="inline-flex items-center gap-2 rounded-full bg-transparent hover:bg-white/10 px-6 py-3 text-xs sm:text-sm font-medium text-white/90 hover:text-white font-mono transition-colors duration-150"
                >
                  <Play className="h-3.5 w-3.5" />
                  {secondaryButtonText}
                </button>
              )}
            </div>
          </div>

          {/* Partner / Protocol Grid */}
          <div className="mx-auto mt-20 max-w-4xl">
            <p className="animate-fade-slide-in-1 text-xs font-mono uppercase tracking-widest text-white/60 text-center">
              {partnersTitle}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 animate-fade-slide-in-2 text-white/80 mt-6 items-center justify-items-center gap-3">
              {partners.map((partner, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 transition-colors w-full sm:w-auto"
                >
                  {partner.icon}
                  <span>{partner.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
export default ResponsiveHeroBanner
