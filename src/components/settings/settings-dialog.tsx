import * as React from "react"
import {
  SlidersHorizontalIcon,
  DatabaseIcon,
  InfoIcon,
  PaintbrushIcon,
  ScrollTextIcon,
  BellIcon,
  CodeIcon,
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
import { AboutTab } from "@/components/settings/about-tab"
import { AppearanceTab } from "@/components/settings/appearance-tab"
import { BehaviorTab } from "@/components/settings/behavior-tab"
import { ChangelogTab } from "@/components/settings/changelog-tab"
import { DataManagementTab } from "@/components/settings/data-management-tab"
import { HighlightsTab } from "@/components/settings/highlights-tab"
import { IS_DEV } from "@/lib/dev/is-dev"

const DeveloperTab = IS_DEV
  ? React.lazy(async () => {
      const module = await import("@/components/settings/developer-tab")
      return { default: module.DeveloperTab }
    })
  : null

export type SettingsCategory =
  | "appearance"
  | "behavior"
  | "highlights"
  | "data"
  | "changelog"
  | "about"
  | "developer"

type SettingsCategoryEntry = {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const CORE_SETTINGS_CATEGORIES: SettingsCategoryEntry[] = [
  { id: "appearance", label: "Appearance", icon: PaintbrushIcon },
  { id: "behavior", label: "Behavior", icon: SlidersHorizontalIcon },
  { id: "highlights", label: "Highlights", icon: BellIcon },
  { id: "data", label: "Data Management", icon: DatabaseIcon },
  ...(IS_DEV
    ? [{ id: "developer" as const, label: "Developer", icon: CodeIcon }]
    : []),
]

const META_SETTINGS_CATEGORIES: SettingsCategoryEntry[] = [
  { id: "changelog", label: "Changelog", icon: ScrollTextIcon },
  { id: "about", label: "About", icon: InfoIcon },
]

function useTooltipPointerOnlyGuard(enabled: boolean) {
  const [pointerMode, setPointerMode] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) {
      setPointerMode(false)
      return
    }

    setPointerMode(false)

    const onPointer = () => {
      setPointerMode(true)
    }
    const onKeyDown = () => {
      setPointerMode(false)
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

  return enabled && pointerMode
}

function CategoryIconButton({
  category,
  selected,
  onSelect,
  allowTooltipOpen,
}: {
  category: SettingsCategoryEntry
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
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            selected
              ? "bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/25 hover:bg-primary/12 dark:bg-primary/20 dark:hover:bg-primary/24 dark:ring-primary/35"
              : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
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
  initialCategory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCategory?: SettingsCategory
}) {
  const [activeCategory, setActiveCategory] =
    React.useState<SettingsCategory>("appearance")
  const allowTooltipOpen = useTooltipPointerOnlyGuard(open)

  React.useEffect(() => {
    if (open && initialCategory) {
      setActiveCategory(initialCategory)
    }
  }, [open, initialCategory])

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
              {CORE_SETTINGS_CATEGORIES.map((category) => (
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
              {META_SETTINGS_CATEGORIES.map((category) => (
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
              {activeCategory === "appearance" && <AppearanceTab />}
              {activeCategory === "behavior" && <BehaviorTab />}
              {activeCategory === "highlights" && <HighlightsTab />}
              {activeCategory === "data" && <DataManagementTab />}
              {activeCategory === "changelog" && <ChangelogTab />}
              {activeCategory === "about" && <AboutTab />}
              {IS_DEV && activeCategory === "developer" && DeveloperTab ? (
                <React.Suspense fallback={null}>
                  <DeveloperTab />
                </React.Suspense>
              ) : null}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
