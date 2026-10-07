import * as React from "react"
import {
  DatabaseIcon,
  InfoIcon,
  PaintbrushIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  ScrollTextIcon,
  CircleHelpIcon,
  BellIcon,
  CodeIcon,
  XIcon,
} from "lucide-react"

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APP_BRANDING } from "@/lib/branding"
import { getAppVersion } from "@/lib/changelog"
import { AboutTab } from "@/components/settings/about-tab"
import { AppearanceTab } from "@/components/settings/appearance-tab"
import { ChatTab } from "@/components/settings/chat-tab"
import { ChangelogTab } from "@/components/settings/changelog-tab"
import { HelpTab } from "@/components/settings/help-tab"
import { DataManagementTab } from "@/components/settings/data-management-tab"
import { HighlightsTab } from "@/components/settings/highlights-tab"
import { PlayerTab } from "@/components/settings/player-tab"
import { IS_DEV } from "@/lib/dev/is-dev"
import {
  installSettingsPortaledLayerPointerGuard,
  shouldPreventSettingsDismiss,
} from "@/lib/settings/settings-portaled-layers"

const DeveloperTab = IS_DEV
  ? React.lazy(async () => {
      const module = await import("@/components/settings/developer-tab")
      return { default: module.DeveloperTab }
    })
  : null

export type SettingsCategory =
  | "appearance"
  | "chat"
  | "highlights"
  | "player"
  | "data"
  | "changelog"
  | "help"
  | "about"
  | "developer"

type SettingsCategoryEntry = {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const PREFERENCE_CATEGORIES: SettingsCategoryEntry[] = [
  { id: "appearance", label: "Appearance", icon: PaintbrushIcon },
  { id: "chat", label: "Chat", icon: MessageSquareIcon },
  { id: "player", label: "Player", icon: MonitorPlayIcon },
  { id: "highlights", label: "Highlights", icon: BellIcon },
  { id: "data", label: "Data Management", icon: DatabaseIcon },
  ...(IS_DEV
    ? [{ id: "developer" as const, label: "Developer", icon: CodeIcon }]
    : []),
]

const RESOURCE_CATEGORIES: SettingsCategoryEntry[] = [
  { id: "changelog", label: "Changelog", icon: ScrollTextIcon },
  { id: "help", label: "Help", icon: CircleHelpIcon },
]

const ABOUT_CATEGORY = {
  id: "about",
  label: "About",
  icon: InfoIcon,
} satisfies SettingsCategoryEntry

function NavRowButton({
  category,
  selected,
  onSelect,
}: {
  category: SettingsCategoryEntry
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-label={category.label}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
      className={cn(
        "flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/35 max-sm:h-9 max-sm:w-9 max-sm:justify-center max-sm:px-0",
        selected
          ? "bg-primary/10 text-foreground dark:bg-primary/20"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      <category.icon className="size-4 shrink-0" />
      <span aria-hidden className="truncate max-sm:hidden">
        {category.label}
      </span>
    </button>
  )
}

function BrandFooter({
  active,
  onOpenAbout,
}: {
  active: boolean
  onOpenAbout: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`About ${APP_BRANDING.title}`}
      aria-current={active ? "page" : undefined}
      onClick={onOpenAbout}
      className={cn(
        "mt-auto flex shrink-0 items-center gap-2.5 border-t px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/35 max-sm:justify-center",
        active
          ? "border-primary/20 bg-primary/10 dark:bg-primary/20"
          : "border-border/60 hover:bg-foreground/[0.04]"
      )}
    >
      <img
        src={APP_BRANDING.appIcon}
        alt=""
        className="size-7 shrink-0 rounded-md border border-border/40 object-cover"
      />
      <div aria-hidden className="min-w-0 leading-tight max-sm:hidden">
        <p className="truncate text-xs font-semibold">{APP_BRANDING.title}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
          v{getAppVersion()}
        </p>
      </div>
    </button>
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
  const [openSnapshot, setOpenSnapshot] = React.useState({
    open,
    initialCategory,
  })
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  if (
    open !== openSnapshot.open ||
    initialCategory !== openSnapshot.initialCategory
  ) {
    setOpenSnapshot({ open, initialCategory })
    if (open && initialCategory) {
      setActiveCategory(initialCategory)
    }
  }

  React.useEffect(() => {
    if (!open) {
      return
    }

    return installSettingsPortaledLayerPointerGuard()
  }, [open])

  React.useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [activeCategory])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
  }

  const handleSelect = (
    category: SettingsCategoryEntry,
    element?: HTMLElement
  ) => {
    setActiveCategory(category.id)
    // Keeps edge chips in view while paging through the mobile chip bar.
    element?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent
        side="right"
        showCloseButton={false}
        showOverlay={false}
        data-hotkey-surface="settings"
        className="h-svh gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 sm:data-[side=right]:w-[34rem] data-[side=right]:sm:max-w-[34rem] sm:data-[side=right]:border-l"
        onInteractOutside={(event) => {
          if (shouldPreventSettingsDismiss(event.target)) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (shouldPreventSettingsDismiss(event.target)) {
            event.preventDefault()
          }
        }}
        onFocusOutside={(event) => {
          if (shouldPreventSettingsDismiss(event.target)) {
            event.preventDefault()
          }
        }}
      >
        <SheetTitle className="sr-only">Settings</SheetTitle>

        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex w-14 shrink-0 flex-col border-r border-border bg-sidebar sm:w-44">
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-1">
              <div
                aria-hidden
                className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/60 max-sm:hidden"
              >
                Preferences
              </div>
              <div className="flex flex-col gap-0.5">
                {PREFERENCE_CATEGORIES.map((category) => (
                  <NavRowButton
                    key={category.id}
                    category={category}
                    selected={activeCategory === category.id}
                    onSelect={() => handleSelect(category)}
                  />
                ))}
              </div>

              <div
                aria-hidden
                className="px-2.5 pt-4 pb-1 text-[11px] font-medium text-muted-foreground/60 max-sm:hidden"
              >
                Resources
              </div>
              <div className="flex flex-col gap-0.5">
                {RESOURCE_CATEGORIES.map((category) => (
                  <NavRowButton
                    key={category.id}
                    category={category}
                    selected={activeCategory === category.id}
                    onSelect={() => handleSelect(category)}
                  />
                ))}
              </div>
            </div>

            <BrandFooter
              active={activeCategory === "about"}
              onOpenAbout={() => handleSelect(ABOUT_CATEGORY)}
            />
          </div>

          <div className="relative min-h-0 min-w-0 flex-1">
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2.5 right-2.5 z-10 bg-background/70 shadow-xs backdrop-blur-xs transition-colors hover:bg-background sm:top-3 sm:right-3"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>

            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overscroll-contain p-4 sm:p-5"
            >
              <div
                key={activeCategory}
                className="animate-in duration-150 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
              >
                {activeCategory === "appearance" && <AppearanceTab />}
                {activeCategory === "chat" && <ChatTab />}
                {activeCategory === "player" && <PlayerTab />}
                {activeCategory === "highlights" && <HighlightsTab />}
                {activeCategory === "data" && <DataManagementTab />}
                {activeCategory === "changelog" && <ChangelogTab />}
                {activeCategory === "help" && <HelpTab />}
                {activeCategory === "about" && <AboutTab />}
                {IS_DEV && activeCategory === "developer" && DeveloperTab ? (
                  <React.Suspense fallback={null}>
                    <DeveloperTab />
                  </React.Suspense>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
