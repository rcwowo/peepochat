import * as React from "react"

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="rounded-full border border-border bg-muted/40 p-3">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="max-w-xs text-sm text-muted-foreground">
          {description}
        </div>
      </div>
    </div>
  )
}
