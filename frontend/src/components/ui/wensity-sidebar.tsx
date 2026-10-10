import * as React from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a Sidebar component")
  }
  return context
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  defaultCollapsed?: boolean
  width?: number
  collapsedWidth?: number
}

export function Sidebar({
  defaultCollapsed = false,
  width = 240,
  collapsedWidth = 60,
  className,
  children,
  ...props
}: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState<boolean>(defaultCollapsed)

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      <TooltipProvider delayDuration={150}>
        <aside
          data-collapsed={collapsed}
          className={cn(
            "relative flex flex-col shrink-0 border-r border-border bg-card transition-[width] duration-200 ease-out select-none",
            className
          )}
          style={{ width: collapsed ? `${collapsedWidth}px` : `${width}px` }}
          {...props}
        >
          {children}
        </aside>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

export function SidebarHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between border-b border-border px-3 shrink-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function SidebarToggle({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, toggle } = useSidebar()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  )
}

export function SidebarNav({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={cn("flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4", className)}
      {...props}
    >
      {children}
    </nav>
  )
}

export function SidebarSection({
  label,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { label?: string }) {
  const { collapsed } = useSidebar()

  return (
    <div className={cn("space-y-1", className)} {...props}>
      {label && !collapsed && (
        <div className="px-2 py-1 text-[10px] font-mono font-medium tracking-wider text-muted-foreground/80 uppercase">
          {label}
        </div>
      )}
      {children}
    </div>
  )
}

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  active?: boolean
  badge?: React.ReactNode
}

export function SidebarItem({
  icon,
  active = false,
  badge,
  children,
  className,
  ...props
}: SidebarItemProps) {
  const { collapsed } = useSidebar()

  const buttonContent = (
    <button
      type="button"
      data-active={active}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-left",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-0 h-8",
        className
      )}
      {...props}
    >
      <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="truncate flex-1">{children}</span>
          {badge && <span className="shrink-0">{badge}</span>}
        </>
      )}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    )
  }

  return buttonContent
}

export function SidebarFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-border p-2 shrink-0 bg-card", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[4px] bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
      {children}
    </span>
  )
}
