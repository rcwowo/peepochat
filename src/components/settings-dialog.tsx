import * as React from "react"
import {
  BrushIcon,
  InfoIcon,
  SettingsIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { GeneralTab } from "@/components/settings/general-tab"

type SettingsCategory =
  | "general"
  | "appearance"
  | "behavior"
  | "highlights"
  | "about"

const SETTINGS_CATEGORIES: {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  separated?: boolean
}[] = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: BrushIcon },
  { id: "behavior", label: "Behavior", icon: ZapIcon },
  { id: "highlights", label: "Highlights", icon: SparklesIcon },
  { id: "about", label: "About", icon: InfoIcon, separated: true },
]

function useTooltipPointerOnlyGuard(enabled: boolean) {
  const lastInteraction = React.useRef<"unknown" | "pointer" | "keyboard">(
    "unknown"
  )
  const [, forceRender] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    if (!enabled) return

    // Reset each time the sheet opens so focus can't pop tooltips.
    lastInteraction.current = "unknown"
    forceRender()

    const onPointer = () => {
      if (lastInteraction.current === "pointer") return
      lastInteraction.current = "pointer"
      forceRender()
    }
    const onKeyDown = () => {
      if (lastInteraction.current === "keyboard") return
      lastInteraction.current = "keyboard"
      forceRender()
    }

    window.addEventListener("pointerdown", onPointer, { capture: true })
    window.addEventListener("pointermove", onPointer, { capture: true })
    window.addEventListener("keydown", onKeyDown, { capture: true })

    return () => {
      window.removeEventListener("pointerdown", onPointer, { capture: true })
      window.removeEventListener("pointermove", onPointer, { capture: true })
      window.removeEventListener("keydown", onKeyDown, { capture: true })
    }
  }, [enabled])

  return lastInteraction.current === "pointer"
}

function CategoryIconButton({
  category,
  selected,
  onSelect,
  allowTooltipOpen,
}: {
  category: (typeof SETTINGS_CATEGORIES)[number]
  selected: boolean
  onSelect: () => void
  allowTooltipOpen: boolean
}) {
  const [tooltipOpen, setTooltipOpen] = React.useState(false)

  return (
    <Tooltip
      open={tooltipOpen}
      onOpenChange={(next) => {
        if (next && !allowTooltipOpen) {
          setTooltipOpen(false)
          return
        }
        setTooltipOpen(next)
      }}
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            selected
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          }`}
        >
          <category.icon className="size-4" />
          <span className="sr-only">{category.label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {category.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [activeCategory, setActiveCategory] =
    React.useState<SettingsCategory>("general")
  const allowTooltipOpen = useTooltipPointerOnlyGuard(open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        showOverlay={false}
        className="h-svh gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 sm:data-[side=right]:border-l sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border bg-sidebar px-4 py-0 h-12 flex-row items-center justify-between">
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-14 shrink-0 flex-col border-r border-border bg-muted/20 p-2">
            <div className="flex flex-col gap-0.5">
              {SETTINGS_CATEGORIES.filter((c) => !c.separated).map((category) => (
                <CategoryIconButton
                  key={category.id}
                  category={category}
                  selected={activeCategory === category.id}
                  onSelect={() => setActiveCategory(category.id)}
                  allowTooltipOpen={allowTooltipOpen}
                />
              ))}
            </div>

            <div className="mt-auto pt-2">
              <Separator className="mb-2" />
              {SETTINGS_CATEGORIES.filter((c) => c.separated).map((category) => (
                <CategoryIconButton
                  key={category.id}
                  category={category}
                  selected={activeCategory === category.id}
                  onSelect={() => setActiveCategory(category.id)}
                  allowTooltipOpen={allowTooltipOpen}
                />
              ))}
            </div>
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <div className="p-4">
              {activeCategory === "general" && <GeneralTab />}
              {activeCategory === "appearance" && (
                <PlaceholderCategory
                  title="Appearance"
                  description="Theme, colors, font, and visual density."
                />
              )}
              {activeCategory === "behavior" && (
                <PlaceholderCategory
                  title="Behavior"
                  description="Chat behavior, timestamps, and connection defaults."
                />
              )}
              {activeCategory === "highlights" && (
                <PlaceholderCategory
                  title="Highlights"
                  description="Highlight rules and visual emphasis."
                />
              )}
              {activeCategory === "about" && <AboutCategory />}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PlaceholderCategory({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        This category is a stub in the first draft. Next we’ll move the relevant
        settings here and compact the layout for the drawer.
      </div>
    </div>
  )
}

function AboutCategory() {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">About</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Info, links, and version details.
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        Version <span className="font-mono">{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
