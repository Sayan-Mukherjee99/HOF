import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-mono font-medium transition-colors duration-150 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-border bg-muted text-foreground",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        low:
          "border-border bg-transparent text-muted-foreground",
        medium:
          "border-amber-500/30 bg-transparent text-amber-600 dark:text-amber-400",
        high:
          "border-red-500/30 bg-transparent text-red-600 dark:text-red-400",
        blocked:
          "border-red-700 bg-red-800 text-white dark:border-red-700 dark:bg-red-900 dark:text-white",
        outline:
          "border-border text-foreground bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
