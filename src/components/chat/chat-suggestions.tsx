import * as React from "react"

import type { EmoteSuggestion } from "@/lib/emote-completion"
import { cn } from "@/lib/utils"

type ChatSuggestionsProps = {
  open: boolean
  index: number
  suggestions: EmoteSuggestion[]
  onSelect: (suggestion: EmoteSuggestion) => void
}

export function ChatSuggestions({
  open,
  index,
  suggestions,
  onSelect,
}: ChatSuggestionsProps) {
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useLayoutEffect(() => {
    if (!open || suggestions.length === 0) return

    const list = listRef.current
    const activeItem = list?.children.item(index) as HTMLElement | null
    activeItem?.scrollIntoView({ block: "nearest" })
  }, [index, open, suggestions.length])

  if (!open || suggestions.length === 0) {
    return null
  }

  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-1.5 flex max-h-56 w-full min-w-[min(20rem,100%)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-md"
      role="listbox"
      aria-label="Emote suggestions"
    >
      <ul
        ref={listRef}
        className="overflow-y-auto overscroll-contain py-1"
      >
        {suggestions.map((suggestion, suggestionIndex) => (
          <li key={`${suggestion.value}-${suggestionIndex}`}>
            <button
              type="button"
              role="option"
              aria-selected={suggestionIndex === index}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors",
                suggestionIndex === index
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(suggestion)
              }}
            >
              <img
                src={suggestion.imageUrl}
                alt=""
                className="size-7 shrink-0 object-contain"
                loading="lazy"
                decoding="async"
              />
              <span className="min-w-0 truncate font-medium">
                {suggestion.display}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground capitalize">
                {suggestion.provider}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
