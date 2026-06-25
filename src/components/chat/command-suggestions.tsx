import * as React from "react"

import type { CommandSuggestion } from "@/lib/chat/command-completion"
import { cn } from "@/lib/utils"

type CommandSuggestionsProps = {
  open: boolean
  index: number
  suggestions: CommandSuggestion[]
  usageHint: string | null
  usageHintDetail: string | null
  onSelect: (suggestion: CommandSuggestion) => void
}

export function CommandSuggestions({
  open,
  index,
  suggestions,
  usageHint,
  usageHintDetail,
  onSelect,
}: CommandSuggestionsProps) {
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useLayoutEffect(() => {
    if (!open || suggestions.length === 0) return

    const list = listRef.current
    const activeItem = list?.children.item(index) as HTMLElement | null
    activeItem?.scrollIntoView({ block: "nearest" })
  }, [index, open, suggestions.length])

  if (!open) {
    return null
  }

  if (suggestions.length === 0 && !usageHint && !usageHintDetail) {
    return null
  }

  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-1.5 flex max-h-56 w-full min-w-[min(24rem,100%)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-md"
      role="listbox"
      aria-label="Command suggestions"
    >
      {usageHint || usageHintDetail ? (
        <div className="space-y-1 border-b border-border/60 px-2.5 py-2 text-xs text-muted-foreground">
          {usageHint ? <p>{usageHint}</p> : null}
          {usageHintDetail ? <p>{usageHintDetail}</p> : null}
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <ul ref={listRef} className="overflow-y-auto overscroll-contain py-1">
          {suggestions.map((suggestion, suggestionIndex) => (
            <li key={`${suggestion.name}-${suggestionIndex}`}>
              <button
                type="button"
                role="option"
                aria-selected={suggestionIndex === index}
                className={cn(
                  "flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-sm transition-colors",
                  suggestionIndex === index
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(suggestion)
                }}
              >
                <span className="shrink-0 font-medium">
                  {suggestion.display}
                </span>
                {suggestion.usage ? (
                  <span className="min-w-0 truncate text-muted-foreground">
                    {suggestion.usage}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {suggestion.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
