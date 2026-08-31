import * as React from "react"
import { SearchIcon, SmileIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmoteCardPopover } from "@/components/chat/emote-card-popover"
import { toEmoteCardTarget } from "@/lib/chat/emote-card"
import { isSevenTvZeroWidthEmote } from "@/lib/chat/seventv-emotes"
import { Spinner } from "@/components/ui/spinner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  ComposerEmote,
  ComposerEmoteCatalog,
  EmotePickerCategory,
  EmotePickerPlatformId,
} from "@/lib/chat/chat-emote-catalog"
import {
  findPickerCategory,
  getDefaultPickerSelection,
} from "@/lib/chat/chat-emote-catalog"
import { PickerIcon } from "@/components/chat/picker-icon"
import {
  determineEmoteRatioBucket,
  emotePickerCellWidthClass,
  emotePickerEmoteKey,
  sortPickerEmotes,
  type EmoteRatioBucket,
} from "@/lib/chat/emote-picker-layout"
import { cn } from "@/lib/utils"

type EmotePickerProps = {
  catalog: ComposerEmoteCatalog
  loading?: boolean
  disabled?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (code: string) => void
}

export function EmotePicker({
  catalog,
  loading = false,
  disabled = false,
  open,
  onOpenChange,
  onSelect,
}: EmotePickerProps) {
  const [query, setQuery] = React.useState("")
  const [platformId, setPlatformId] =
    React.useState<EmotePickerPlatformId>("twitch")
  const [categoryId, setCategoryId] = React.useState("")
  const [wasOpen, setWasOpen] = React.useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery("")
    } else {
      const defaults = getDefaultPickerSelection(catalog)
      if (defaults) {
        setPlatformId(defaults.platformId)
        setCategoryId(defaults.categoryId)
      }
    }
  }

  const searchResults = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []

    return [...catalog.byCode.values()]
      .filter((emote) => emote.code.toLowerCase().includes(normalized))
      .slice(0, 96)
  }, [catalog, query])

  const activePlatform = React.useMemo(
    () => catalog.platforms.find((platform) => platform.id === platformId),
    [catalog.platforms, platformId]
  )

  const handleOpenChange = (next: boolean) => {
    if (next && disabled) {
      return
    }

    onOpenChange(next)
  }

  const handleSelect = (code: string) => {
    onSelect(code)
    onOpenChange(false)
  }

  const handlePlatformChange = (value: string) => {
    const nextPlatformId = value as EmotePickerPlatformId
    setPlatformId(nextPlatformId)

    const platform = catalog.platforms.find(
      (entry) => entry.id === nextPlatformId
    )
    const nextCategoryId = platform?.categories[0]?.id ?? ""
    if (nextCategoryId) {
      setCategoryId(nextCategoryId)
    }
  }

  const resolvedCategoryId = React.useMemo(() => {
    if (!activePlatform) {
      return categoryId
    }

    const categoryStillValid = activePlatform.categories.some(
      (category) => category.id === categoryId
    )

    return categoryStillValid
      ? categoryId
      : (activePlatform.categories[0]?.id ?? categoryId)
  }, [activePlatform, categoryId])

  const resolvedCategory = React.useMemo(
    () =>
      query.trim()
        ? null
        : findPickerCategory(catalog, platformId, resolvedCategoryId),
    [catalog, platformId, query, resolvedCategoryId]
  )

  return (
    <Popover open={open && !disabled} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Open emote picker"
              className="absolute right-1 bottom-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            >
              <SmileIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Emote picker</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="flex h-[min(19.5rem,62vh)] w-[min(23.5rem,calc(100vw-1rem))] flex-col overflow-hidden p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-border/80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            className="h-8 rounded-none rounded-t-md border-0 py-0 pr-2.5 pl-8 text-sm shadow-none focus-visible:ring-0"
          />
        </div>

        {query.trim() ? (
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <EmoteGrid emotes={searchResults} onSelect={handleSelect} />
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            <Spinner
              className="size-5 text-muted-foreground"
              aria-label="Loading emotes"
            />
          </div>
        ) : catalog.platforms.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Emotes load after the channel connects.
          </div>
        ) : (
          <Tabs
            value={platformId}
            onValueChange={handlePlatformChange}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <PlatformTabs platforms={catalog.platforms} />

            {activePlatform ? (
              <div className="flex min-h-0 flex-1">
                <CategoryNav
                  categories={activePlatform.categories}
                  activeId={resolvedCategoryId}
                  onSelect={setCategoryId}
                />

                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                  <EmoteGrid
                    emotes={resolvedCategory?.emotes ?? []}
                    onSelect={handleSelect}
                  />
                </div>
              </div>
            ) : null}
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  )
}

function PlatformTabs({
  platforms,
}: {
  platforms: ComposerEmoteCatalog["platforms"]
}) {
  return (
    <TabsList
      variant="line"
      className="grid h-9! w-full shrink-0 gap-0 rounded-none border-b border-border/80 bg-popover p-0 **:data-[slot=tabs-trigger]:after:hidden"
      style={{
        gridTemplateColumns: `repeat(${platforms.length}, minmax(0, 1fr))`,
      }}
    >
      {platforms.map((platform) => (
        <TabsTrigger
          key={platform.id}
          value={platform.id}
          className={cn(
            "group/tab relative h-9! min-h-0 w-full min-w-0 flex-row items-center justify-center gap-1.5 rounded-none border-0 px-2 py-0 shadow-none after:hidden",
            "text-muted-foreground hover:text-foreground",
            "data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          )}
        >
          <PickerIcon src={platform.iconSrc} className="size-4 shrink-0" />
          <span className="truncate text-xs leading-none font-medium">
            {platform.label}
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-0 z-10 h-0.5 rounded-full bg-primary opacity-0 transition-opacity group-data-[state=active]/tab:opacity-100"
          />
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: EmotePickerCategory[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      className="flex w-10 shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-contain border-r border-border/80 p-1"
      aria-label="Emote categories"
    >
      {categories.map((category) => {
        const active = activeId === category.id

        return (
          <Tooltip key={category.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={category.label}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(category.id)}
                className={cn(
                  "mx-auto box-border flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  active
                    ? "border-2 border-primary"
                    : "border-2 border-transparent opacity-75 hover:border-border hover:opacity-100"
                )}
              >
                <PickerIcon src={category.iconSrc} rounded className="size-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">
              {category.label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

function EmoteGrid({
  emotes,
  onSelect,
}: {
  emotes: ComposerEmote[]
  onSelect: (code: string) => void
}) {
  const emoteSetKey = React.useMemo(
    () => emotes.map((emote) => emotePickerEmoteKey(emote)).join("\0"),
    [emotes]
  )

  return <EmoteGridBody key={emoteSetKey} emotes={emotes} onSelect={onSelect} />
}

function EmoteGridBody({
  emotes,
  onSelect,
}: {
  emotes: ComposerEmote[]
  onSelect: (code: string) => void
}) {
  const [ratioBuckets, setRatioBuckets] = React.useState(
    () => new Map<string, EmoteRatioBucket>()
  )

  const sortedEmotes = React.useMemo(
    () =>
      sortPickerEmotes(emotes, (emote) => {
        return ratioBuckets.get(emotePickerEmoteKey(emote)) ?? 1
      }),
    [emotes, ratioBuckets]
  )

  const noteDimensions = React.useCallback(
    (emote: ComposerEmote, width: number, height: number) => {
      const key = emotePickerEmoteKey(emote)
      const bucket = determineEmoteRatioBucket(width, height)
      setRatioBuckets((previous) => {
        if (previous.get(key) === bucket) return previous
        return new Map(previous).set(key, bucket)
      })
    },
    []
  )

  if (emotes.length === 0) {
    return (
      <div className="flex h-full min-h-20 items-center justify-center p-4 text-center text-xs text-muted-foreground">
        None available.
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-wrap content-start justify-center gap-1 overflow-x-hidden p-1.5">
      {sortedEmotes.map((emote) => (
        <EmoteGridItem
          key={emotePickerEmoteKey(emote)}
          emote={emote}
          ratioBucket={ratioBuckets.get(emotePickerEmoteKey(emote)) ?? 1}
          onDimensions={noteDimensions}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function EmoteGridItem({
  emote,
  ratioBucket,
  onDimensions,
  onSelect,
}: {
  emote: ComposerEmote
  ratioBucket: EmoteRatioBucket
  onDimensions: (emote: ComposerEmote, width: number, height: number) => void
  onSelect: (code: string) => void
}) {
  const target = React.useMemo(() => toEmoteCardTarget(emote), [emote])
  const zeroWidth = isSevenTvZeroWidthEmote(emote)

  return (
    <div
      className={cn(
        "h-9 max-w-full min-w-0 shrink-0",
        emotePickerCellWidthClass(ratioBucket)
      )}
    >
      <EmoteCardPopover target={target} openOnClick={false}>
        <button
          type="button"
          aria-label={emote.code}
          className={cn(
            "grid h-9 w-full min-w-0 cursor-pointer overflow-hidden rounded-md bg-muted/15 transition-colors hover:bg-muted/50",
            zeroWidth && "ring-1 ring-[rgb(220,170,50)]"
          )}
          onClick={() => onSelect(emote.code)}
        >
          <img
            src={emote.imageUrl}
            alt=""
            className="m-auto max-h-9 max-w-full object-contain"
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              const img = event.currentTarget
              onDimensions(emote, img.naturalWidth, img.naturalHeight)
            }}
          />
        </button>
      </EmoteCardPopover>
    </div>
  )
}
