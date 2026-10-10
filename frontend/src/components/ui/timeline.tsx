import * as React from "react"
import { cn } from "@/lib/utils"

export interface TimelineProps extends React.HTMLAttributes<HTMLOListElement> {}

export const Timeline = React.forwardRef<HTMLOListElement, TimelineProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <ol
        ref={ref}
        className={cn("relative border-l border-border ml-3 space-y-4", className)}
        {...props}
      >
        {children}
      </ol>
    )
  }
)
Timeline.displayName = "Timeline"

export interface TimelineItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  status?: "default" | "active" | "completed" | "error"
}

export const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, status = "default", children, ...props }, ref) => {
    return (
      <li
        ref={ref}
        className={cn("relative pl-6 last:pb-0", className)}
        data-status={status}
        {...props}
      >
        {children}
      </li>
    )
  }
)
TimelineItem.displayName = "TimelineItem"

export interface TimelineDotProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "low" | "medium" | "high" | "blocked"
}

export const TimelineDot = React.forwardRef<HTMLDivElement, TimelineDotProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "bg-muted-foreground/30 border-border",
      low: "bg-emerald-500/80 border-emerald-500/30",
      medium: "bg-amber-500/80 border-amber-500/30",
      high: "bg-red-500/80 border-red-500/30",
      blocked: "bg-red-800 border-red-950",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border bg-background transition-colors",
          variantStyles[variant],
          className
        )}
        {...props}
      />
    )
  }
)
TimelineDot.displayName = "TimelineDot"

export interface TimelineHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TimelineHeader = React.forwardRef<HTMLDivElement, TimelineHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-row items-center justify-between gap-2 text-xs", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TimelineHeader.displayName = "TimelineHeader"

export interface TimelineTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const TimelineTitle = React.forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h4
        ref={ref}
        className={cn("text-xs font-medium text-foreground", className)}
        {...props}
      >
        {children}
      </h4>
    )
  }
)
TimelineTitle.displayName = "TimelineTitle"

export interface TimelineTimeProps extends React.HTMLAttributes<HTMLTimeElement> {}

export const TimelineTime = React.forwardRef<HTMLTimeElement, TimelineTimeProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <time
        ref={ref}
        className={cn("text-xs text-muted-foreground font-mono tabular-nums", className)}
        {...props}
      >
        {children}
      </time>
    )
  }
)
TimelineTime.displayName = "TimelineTime"

export interface TimelineDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const TimelineDescription = React.forwardRef<HTMLParagraphElement, TimelineDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn("text-xs text-muted-foreground mt-0.5", className)}
        {...props}
      >
        {children}
      </p>
    )
  }
)
TimelineDescription.displayName = "TimelineDescription"

export interface TimelineContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TimelineContent = React.forwardRef<HTMLDivElement, TimelineContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("mt-1.5 text-xs text-foreground", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TimelineContent.displayName = "TimelineContent"
