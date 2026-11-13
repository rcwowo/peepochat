import * as React from "react"
import {
  AudioLinesIcon,
  DatabaseIcon,
  InfoIcon,
  PaintbrushIcon,
  MessageSquareIcon,
  PenLineIcon,
  MonitorPlayIcon,
  ScrollTextIcon,
  CircleHelpIcon,
  BellIcon,
  CodeIcon,
  SpeechIcon,
  TerminalIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { NicknamesTab } from "@/components/settings/nicknames-tab"
import { PlayerTab } from "@/components/settings/player-tab"
import { TtsCommandsTab } from "@/components/settings/tts/tts-commands-tab"
import { TtsSoundsTab } from "@/components/settings/tts/tts-sounds-tab"
import { TtsSpeechTab } from "@/components/settings/tts/tts-speech-tab"
import { TtsVoicesTab } from "@/components/settings/tts/tts-voices-tab"
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
  | "nicknames"
  | "highlights"
  | "player"
  | "data"
  | "tts-speech"
  | "tts-voices"
  | "tts-sounds"
  | "tts-commands"
  | "changelog"
  | "help"
  | "about"
  | "developer"

type SettingsCategoryEntry = {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  description?: string | (() => string)
}

const PREFERENCE_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: PaintbrushIcon,
    description: "Theme, colors, and the overall look of the client.",
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquareIcon,
    description: "How chat panes behave and what appears in them.",
  },
  {
    id: "nicknames",
    label: "Nicknames",
    icon: PenLineIcon,
    description:
      "Set unique nicknames for users in chat. Mentions will appear normally for everyone else.",
  },
  {
    id: "player",
    label: "Player",
    icon: MonitorPlayIcon,
    description: "Playback and layout options for watching streams.",
  },
  {
    id: "highlights",
    label: "Notifications",
    icon: BellIcon,
    description: "How indicators, pings, and notifications behave.",
  },
  {
    id: "data",
    label: "Data Management",
    icon: DatabaseIcon,
    description: "Backup, restore, or delete your Peepochat data.",
  },
  ...(IS_DEV
    ? [
        {
          id: "developer" as const,
          label: "Developer",
          icon: CodeIcon,
          description: "Hello there, developer!",
        },
      ]
    : []),
]

const TTS_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "tts-speech",
    label: "Speech",
    icon: SpeechIcon,
    description:
      "How chat messages are filtered, queued, and read aloud when text-to-speech is running.",
  },
  {
    id: "tts-voices",
    label: "Voices",
    icon: AudioLinesIcon,
    description:
      "Voice profiles that get assigned to chatters, and the voices each chatter has been given.",
  },
  {
    id: "tts-sounds",
    label: "Sounds",
    icon: Volume2Icon,
    description:
      "Audio clips chatters can trigger by wrapping a sound's name in parentheses.",
  },
  {
    id: "tts-commands",
    label: "Commands",
    icon: TerminalIcon,
    description:
      "Let chat control text-to-speech. Every command starts disabled.",
  },
]

const NAV_GROUPS: { label: string; categories: SettingsCategoryEntry[] }[] = [
  { label: "Preferences", categories: PREFERENCE_CATEGORIES },
  { label: "Text-to-Speech", categories: TTS_CATEGORIES },
]

const RESOURCE_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "changelog",
    label: "Changelog",
    icon: ScrollTextIcon,
    description: () =>
      `You're on version ${getAppVersion()}. Here's what changed in recent releases.`,
  },
  {
    id: "help",
    label: "Help",
    icon: CircleHelpIcon,
    description: "Wiki links and keyboard shortcuts.",
  },
]

const ABOUT_CATEGORY = {
  id: "about",
  label: "About",
  icon: InfoIcon,
  description: "Version info, credits, and support links.",
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

  const handleSelect = (category: SettingsCategoryEntry) => {
    setActiveCategory(category.id)
  }

  const activeEntry =
    [
      ...NAV_GROUPS.flatMap((group) => group.categories),
      ...RESOURCE_CATEGORIES,
      ABOUT_CATEGORY,
    ].find((category) => category.id === activeCategory) ?? null
  const activeDescription =
    typeof activeEntry?.description === "function"
      ? activeEntry.description()
      : activeEntry?.description

  const preventPortaledDismiss = (event: {
    target: EventTarget | null
    preventDefault: () => void
  }) => {
    if (shouldPreventSettingsDismiss(event.target)) {
      event.preventDefault()
    }
  }

  const navGroups = [
    ...NAV_GROUPS,
    { label: "Resources", categories: RESOURCE_CATEGORIES },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        showCloseButton={false}
        data-hotkey-surface="settings"
        aria-describedby={undefined}
        className="flex flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0 sm:h-[min(calc(100dvh-4rem),52rem)] sm:w-[min(calc(100vw-4rem),68rem)] sm:max-w-none sm:shadow-2xl"
        onInteractOutside={preventPortaledDismiss}
        onPointerDownOutside={preventPortaledDismiss}
        onFocusOutside={preventPortaledDismiss}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <div className="flex min-h-0 min-w-0 flex-1">
          <nav
            aria-label="Settings categories"
            className="flex w-14 shrink-0 flex-col border-r border-border bg-sidebar sm:w-48"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-1">
              {navGroups.map((group, index) => (
                <div key={group.label}>
                  {index > 0 ? (
                    <div
                      aria-hidden
                      className="mx-2 my-2 h-px bg-border sm:hidden"
                    />
                  ) : null}
                  <div
                    aria-hidden
                    className={cn(
                      "px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/60 max-sm:hidden",
                      index > 0 && "pt-4"
                    )}
                  >
                    {group.label}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 sm:items-stretch">
                    {group.categories.map((category) => (
                      <NavRowButton
                        key={category.id}
                        category={category}
                        selected={activeCategory === category.id}
                        onSelect={() => handleSelect(category)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <BrandFooter
              active={activeCategory === "about"}
              onOpenAbout={() => handleSelect(ABOUT_CATEGORY)}
            />
          </nav>

          <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2.5 right-2.5 z-10 bg-background/70 shadow-xs backdrop-blur-xs transition-colors hover:bg-background sm:top-3 sm:right-3"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>

            {activeEntry?.id !== "about" ? (
              <div className="shrink-0 border-b border-border py-3 pr-12 pl-4 sm:py-4 sm:pl-6">
                <h2 className="text-base leading-tight font-semibold sm:text-lg">
                  {activeEntry?.label}
                </h2>
                {activeDescription ? (
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                    {activeDescription}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-6 sm:py-5"
            >
              <div
                key={activeCategory}
                className="mx-auto w-full max-w-4xl animate-in duration-150 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
              >
                {activeCategory === "appearance" && <AppearanceTab />}
                {activeCategory === "chat" && <ChatTab />}
                {activeCategory === "nicknames" && <NicknamesTab />}
                {activeCategory === "player" && <PlayerTab />}
                {activeCategory === "highlights" && <HighlightsTab />}
                {activeCategory === "data" && <DataManagementTab />}
                {activeCategory === "tts-speech" && <TtsSpeechTab />}
                {activeCategory === "tts-voices" && <TtsVoicesTab />}
                {activeCategory === "tts-sounds" && <TtsSoundsTab />}
                {activeCategory === "tts-commands" && <TtsCommandsTab />}
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
      </DialogContent>
    </Dialog>
  )
}
