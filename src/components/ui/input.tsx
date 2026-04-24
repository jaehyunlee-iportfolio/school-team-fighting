import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
