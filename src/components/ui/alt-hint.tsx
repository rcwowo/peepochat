import { cn } from "@/lib/utils"

export function AltHint({
  label,
  className,
}: {
  label: string | undefined
  className?: string
}) {
  if (!label) {
    return null
  }

  return (
    <kbd
      aria-hidden
      data-alt-hint=""
      className={cn(
        "pointer-events-none absolute z-30 hidden h-4 min-w-4 animate-in items-center justify-center rounded-[5px] bg-muted px-1 font-sans text-[10px] leading-none font-medium text-muted-foreground tabular-nums ring-2 ring-sidebar duration-100 fade-in-0 select-none zoom-in-75 in-data-[alt-hints]:flex",
        className
      )}
    >
      {label}
    </kbd>
  )
}
