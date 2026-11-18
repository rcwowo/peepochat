import * as React from "react"
import { toast } from "sonner"
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CheckCheckIcon,
  CirclePlusIcon,
  Columns2Icon,
  CornerDownRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  KeyboardIcon,
  LogInIcon,
  MonitorIcon,
  MonitorPlayIcon,
  MoonIcon,
  PaletteIcon,
  PanelLeftIcon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  SettingsIcon,
  SmileIcon,
  SunIcon,
  SunMoonIcon,
  Trash2Icon,
  UngroupIcon,
  UserMinusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Command as CommandPrimitive } from "cmdk"

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarChannelAvatar } from "@/components/sidebar/sidebar-channel-icon"
import { useTheme } from "@/components/shell/theme-provider"
import {
  ABOUT_CATEGORY,
  NAV_GROUPS,
  RESOURCE_CATEGORIES,
  TTS_CATEGORY_IDS,
  type SettingsCategory,
  type SettingsCategoryEntry,
} from "@/components/settings/settings-categories"
import { useHotkeyRegistry } from "@/hooks/use-hotkey-registry"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import { useToggleDoNotDisturb } from "@/hooks/use-toggle-do-not-disturb"
import { useSpeechAvailability } from "@/hooks/tts/use-browser-voices"
import {
  getHotkeyKeys,
  getTypedChannelLogin,
  resolveCommandPaletteTarget,
} from "@/lib/command-palette/command-palette"
import {
  FALLBACK_SECTION_BOOST,
  rankPaletteSections,
  type PaletteMatchable,
  type PaletteSection,
} from "@/lib/command-palette/ranking"
import { openExternalTool } from "@/lib/chat/moderation/tools"
import {
  useNotificationCenter,
  useNotificationUnreadCount,
} from "@/lib/highlights/notification-center"
import {
  usePeepochatChat,
  usePeepochatLayout,
  usePeepochatPlayer,
  usePeepochatSettings,
  usePeepochatSidebarHighlights,
} from "@/lib/peepochat/peepochat-context"
import type { HotkeyActionId } from "@/lib/hotkeys/bindings"
import type { TwitchChannel } from "@/lib/peepochat/peepochat-config"
import { getSidebarEntries } from "@/lib/sidebar/sidebar-entries"
import { COLOR_SCHEME_OPTIONS } from "@/lib/theme/color-scheme-options"
import { cn } from "@/lib/utils"

type Page =
  | { kind: "settings" }
  | { kind: "theme" }
  | { kind: "color-scheme" }
  | { kind: "split" }
  | { kind: "remove-channel"; login: string }

type CloseFocus = "restore" | "manual"

type PaletteCommand = PaletteMatchable & {
  id: string
  icon: React.ReactNode
  label: React.ReactNode
  shortcut?: HotkeyActionId
  trailing?: React.ReactNode
  checked?: boolean
  destructive?: boolean
  onSelect: () => void
}

type PaletteGroup = PaletteSection<PaletteCommand> & {
  heading: React.ReactNode
}

const SECTION_ORDER = {
  current: 0,
  split: 1,
  channel: 2,
  typed: 3,
  player: 4,
  general: 5,
  preferences: 6,
  settings: 7,
  theme: 8,
  colorScheme: 9,
} as const

const PAGE_LABELS: Record<Page["kind"], string> = {
  settings: "Settings",
  theme: "Theme",
  "color-scheme": "Color scheme",
  split: "Split",
  "remove-channel": "Remove",
}

const PAGE_PLACEHOLDERS: Record<Page["kind"], string> = {
  settings: "Open settings page...",
  theme: "Choose a theme...",
  "color-scheme": "Choose a color scheme...",
  split: "Choose a channel...",
  "remove-channel": "Confirm removal...",
}

const THEME_OPTIONS: {
  value: "dark" | "light" | "system"
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
]

function Shortcut({ action }: { action: HotkeyActionId }) {
  const keys = getHotkeyKeys(action)
  if (keys.length === 0) {
    return null
  }

  return (
    <KbdGroup data-slot="command-shortcut" className="ml-auto">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}

function ChannelAvatar({
  login,
  profileImageUrl,
  className,
}: {
  login: string
  profileImageUrl?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 overflow-hidden rounded-full bg-secondary",
        className
      )}
    >
      <SidebarChannelAvatar
        login={login}
        profileImageUrl={profileImageUrl}
        className="text-[8px]"
      />
    </span>
  )
}

function WatchedChannelAvatar({
  login,
  className,
}: {
  login: string
  className?: string
}) {
  const { profileImageUrl } = useWatchedChannel(login)
  return (
    <ChannelAvatar
      login={login}
      profileImageUrl={profileImageUrl}
      className={className}
    />
  )
}

function WatchedChannelName({ login }: { login: string }) {
  const { displayName } = useWatchedChannel(login)
  return displayName
}

function SplitAvatars({
  channels,
}: {
  channels: Array<{ login: string; profileImageUrl?: string }>
}) {
  return (
    <span className="flex shrink-0 -space-x-1">
      {channels.slice(0, 3).map((channel) => (
        <ChannelAvatar
          key={channel.login}
          login={channel.login}
          profileImageUrl={channel.profileImageUrl}
          className="size-4 ring-2 ring-popover"
        />
      ))}
    </span>
  )
}

function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-normal text-muted-foreground",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-red-500" />
      Live
    </span>
  )
}

function GroupHeading({
  avatar,
  title,
  hint,
  live,
}: {
  avatar?: React.ReactNode
  title: React.ReactNode
  hint?: string
  live?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {avatar}
      <span className="truncate text-foreground/80">{title}</span>
      {hint ? <span className="shrink-0">— {hint}</span> : null}
      {live ? <LiveBadge className="ml-1 shrink-0" /> : null}
    </span>
  )
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15"
      style={{ backgroundColor: color }}
    />
  )
}

function Name({ children }: { children: React.ReactNode }) {
  return <span className="font-medium">{children}</span>
}

function channelLabel(channel: TwitchChannel | undefined, login: string) {
  return channel?.displayName || login
}

function channelTerms(login: string, channel: TwitchChannel | undefined) {
  return channel?.displayName && channel.displayName.toLowerCase() !== login
    ? [login, channel.displayName]
    : [login]
}

export function CommandPalette({
  open,
  onOpenChange,
  channelSidebarVisible,
  onToggleChannelSidebar,
  onOpenSettings,
  onOpenAddChannel,
  onOpenNotifications,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelSidebarVisible: boolean
  onToggleChannelSidebar: () => void
  onOpenSettings: (category?: SettingsCategory) => void
  onOpenAddChannel: () => void
  onOpenNotifications: () => void
}) {
  const {
    getLastFocusedLogin,
    getPane,
    getSearch,
    rememberFocusedPane,
    requestComposerFocus,
  } = useHotkeyRegistry()
  const {
    config,
    channels,
    activeChannelLogin,
    setActiveChannel,
    addChannel,
    removeChannel,
  } = usePeepochatSettings()
  const {
    savedSplits,
    sidebarOrder,
    channelsInSplits,
    isSplitView,
    activeSplitId,
    splitChannels,
    visibleChannelLogins,
    selectSplit,
    openSplitView,
    addSplitChannel,
    removeSplitChannel,
    unsplit,
  } = usePeepochatLayout()
  const { isChannelLive, isSplitLive } = usePeepochatSidebarHighlights()
  const {
    watchedChannelLogins,
    playerViewActive,
    playerChatLogin,
    openPlayer,
    selectPlayer,
    closeAllPlayers,
  } = usePeepochatPlayer()
  const { refreshEmotes } = usePeepochatChat()
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme()
  const toggleDoNotDisturb = useToggleDoNotDisturb()
  const unreadNotificationCount = useNotificationUnreadCount()
  const { markAllPingsRead, markAllLiveRead, markAllMissedRead } =
    useNotificationCenter()
  const ttsUnavailable = useSpeechAvailability() === "unavailable"

  const [pages, setPages] = React.useState<Page[]>([])
  const [search, setSearch] = React.useState("")
  const [targetLogin, setTargetLogin] = React.useState<string | null>(null)
  const [openSnapshot, setOpenSnapshot] = React.useState(open)
  const [closeFocus, setCloseFocus] = React.useState<CloseFocus>("restore")
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (open !== openSnapshot) {
    setOpenSnapshot(open)
    if (open) {
      setCloseFocus("restore")
      setPages([])
      setSearch("")
      setTargetLogin(
        resolveCommandPaletteTarget({
          playerViewActive,
          playerChatLogin,
          lastFocusedLogin: getLastFocusedLogin(),
          activeChannelLogin,
          visibleChannelLogins,
        })
      )
    }
  }

  React.useLayoutEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open, pages])

  const page = pages[pages.length - 1]
  const query = search.trim()

  const channelByLogin = React.useMemo(
    () => new Map(channels.map((channel) => [channel.login, channel])),
    [channels]
  )
  const sidebarEntries = React.useMemo(
    () =>
      getSidebarEntries(sidebarOrder, savedSplits, channels, channelsInSplits),
    [channels, channelsInSplits, savedSplits, sidebarOrder]
  )
  const settingsCategories = React.useMemo(() => {
    const entries: SettingsCategoryEntry[] = [
      ...NAV_GROUPS.flatMap((group) => group.categories),
      ...RESOURCE_CATEGORIES,
      ABOUT_CATEGORY,
    ]
    return entries.filter(
      (entry) => !(ttsUnavailable && TTS_CATEGORY_IDS.has(entry.id))
    )
  }, [ttsUnavailable])

  const target = targetLogin
  const targetChannel = target ? channelByLogin.get(target) : undefined
  const targetLabel = target ? channelLabel(targetChannel, target) : ""
  const watchedLoginSet = new Set(watchedChannelLogins)

  const renderChannelAvatar = (login: string, className?: string) => {
    const channel = channelByLogin.get(login)
    if (!channel?.profileImageUrl && watchedLoginSet.has(login)) {
      return <WatchedChannelAvatar login={login} className={className} />
    }
    return (
      <ChannelAvatar
        login={login}
        profileImageUrl={channel?.profileImageUrl}
        className={className}
      />
    )
  }

  const renderChannelName = (login: string): React.ReactNode => {
    const channel = channelByLogin.get(login)
    if (!channel?.displayName && watchedLoginSet.has(login)) {
      return <WatchedChannelName login={login} />
    }
    return channelLabel(channel, login)
  }

  const targetName = target ? renderChannelName(target) : null
  const inSplitView = isSplitView && !playerViewActive && Boolean(activeSplitId)
  const activeSplitSet = new Set(inSplitView ? splitChannels : [])
  const canSplitWithTarget = Boolean(target) && !playerViewActive
  const splitCandidates = canSplitWithTarget
    ? channels.filter(
        (channel) =>
          channel.login !== target && !channelsInSplits.has(channel.login)
      )
    : []

  const pushPage = (next: Page) => {
    setPages((current) => [...current, next])
    setSearch("")
  }

  const popPage = () => {
    setPages((current) => current.slice(0, -1))
    setSearch("")
  }

  const run = (action: () => void, focus: CloseFocus = "manual") => {
    setCloseFocus(focus)
    onOpenChange(false)
    action()
  }

  const focusChannel = (login: string) => {
    setActiveChannel(login)
    requestComposerFocus(login)
  }

  const splitTargetWith = (login: string) => {
    if (!target || playerViewActive) {
      return
    }
    if (inSplitView) {
      addSplitChannel(login)
    } else {
      openSplitView([target, login])
    }
    requestComposerFocus(login)
  }

  const addTypedChannel = (login: string, then?: "watch" | "split") => {
    const splitTarget = target
    const splitId = inSplitView ? activeSplitId : null
    run(() => {
      void (async () => {
        try {
          const added = await addChannel(login)
          if (then === "watch") {
            openPlayer(added)
            return
          }
          if (then === "split" && splitTarget) {
            if (splitId) {
              selectSplit(splitId)
              addSplitChannel(added)
            } else {
              openSplitView([splitTarget, added])
            }
          }
          requestComposerFocus(added)
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not add channel"
          )
        }
      })()
    })
  }

  const togglePanePanel = (
    login: string,
    kind: "viewer-list" | "emote-picker"
  ) => {
    run(() => {
      const pane = getPane(login)
      if (!pane) {
        return
      }
      rememberFocusedPane(login)
      if (kind === "viewer-list") {
        pane.toggleViewerList()
      } else {
        pane.toggleEmotePicker()
      }
    })
  }

  const removeFromActiveSplit = (login: string) => {
    const remaining = splitChannels.filter((entry) => entry !== login)
    const nextActive =
      remaining.length >= 2 &&
      activeChannelLogin !== login &&
      remaining.includes(activeChannelLogin)
        ? activeChannelLogin
        : remaining[0]
    run(() => {
      removeSplitChannel(login)
      if (nextActive) {
        requestComposerFocus(nextActive)
      }
    })
  }

  const openChannelPage = (login: string): PaletteCommand => ({
    id: `channel:${login}:open-page`,
    title: "Open channel page",
    keywords: ["twitch", "browser", "external"],
    icon: <ExternalLinkIcon />,
    label: "Open channel page",
    onSelect: () =>
      run(() => openExternalTool(`https://www.twitch.tv/${login}`)),
  })

  const watchChannel = (login: string, label: string): PaletteCommand => ({
    id: `channel:${login}:watch`,
    title: `Watch ${label}`,
    keywords: ["player", "stream", "video"],
    icon: <MonitorPlayIcon />,
    label: (
      <>
        Watch <Name>{label}</Name>
      </>
    ),
    onSelect: () => run(() => openPlayer(login)),
  })

  const removeChannelPrompt = (
    login: string,
    label: string
  ): PaletteCommand => ({
    id: `channel:${login}:remove`,
    title: `Remove ${label}`,
    keywords: ["delete", "close", "leave", "part"],
    icon: <Trash2Icon />,
    label: (
      <>
        Remove <Name>{label}</Name>...
      </>
    ),
    destructive: true,
    onSelect: () => pushPage({ kind: "remove-channel", login }),
  })

  const withSubject = (
    terms: string[],
    items: Array<PaletteCommand | null | false>
  ) =>
    items
      .filter((item): item is PaletteCommand => Boolean(item))
      .map((item) => ({
        ...item,
        keywords: [...terms, ...(item.keywords ?? [])],
      }))

  const buildCurrentSection = (): PaletteGroup | null => {
    if (!target) {
      return null
    }
    const pane = getPane(target)
    const inActiveSplit = activeSplitSet.has(target)
    const canRemove =
      !playerViewActive &&
      !channelsInSplits.has(target) &&
      channelByLogin.has(target)

    return {
      id: `current:${target}`,
      order: SECTION_ORDER.current,
      boost: 0.1,
      showWhenEmpty: true,
      keepItemOrder: true,
      heading: (
        <GroupHeading
          avatar={renderChannelAvatar(target, "size-4")}
          title={targetName}
          hint={inActiveSplit ? "Focused pane" : undefined}
          live={isChannelLive(target)}
        />
      ),
      items: withSubject(channelTerms(target, targetChannel), [
        {
          id: `channel:${target}:search`,
          title: `Search messages in ${targetLabel}`,
          keywords: ["find", "messages", "search"],
          icon: <SearchIcon />,
          label: (
            <>
              Search messages in <Name>{targetName}</Name>
            </>
          ),
          onSelect: () =>
            run(() =>
              getSearch()?.openWithFilters([
                { key: "in", value: target, negated: false },
              ])
            ),
        },
        pane && {
          id: `channel:${target}:viewer-list`,
          title: "Viewer list",
          keywords: ["chatters", "users", "viewers"],
          icon: <UsersIcon />,
          label: "Viewer list",
          shortcut: "viewer-list.open",
          onSelect: () => togglePanePanel(target, "viewer-list"),
        },
        pane && {
          id: `channel:${target}:emote-picker`,
          title: "Emote picker",
          keywords: ["emotes", "emoji"],
          icon: <SmileIcon />,
          label: "Emote picker",
          shortcut: "emote-picker.open",
          onSelect: () => togglePanePanel(target, "emote-picker"),
        },
        !playerViewActive && watchChannel(target, targetLabel),
        canSplitWithTarget &&
          !inSplitView &&
          splitCandidates.length > 0 && {
            id: `channel:${target}:split-with`,
            title: `Split ${targetLabel} with`,
            keywords: ["split", "side by side", "multi"],
            icon: <Columns2Icon />,
            label: (
              <>
                Split <Name>{targetName}</Name> with...
              </>
            ),
            onSelect: () => pushPage({ kind: "split" }),
          },
        inActiveSplit && {
          id: `channel:${target}:remove-from-split`,
          title: `Remove ${targetLabel} from split`,
          keywords: ["split", "unsplit"],
          icon: <UserMinusIcon />,
          label: (
            <>
              Remove <Name>{targetName}</Name> from split
            </>
          ),
          onSelect: () => removeFromActiveSplit(target),
        },
        openChannelPage(target),
        canRemove && removeChannelPrompt(target, targetLabel),
      ]),
    }
  }

  const buildActiveSplitSection = (): PaletteGroup | null => {
    if (!inSplitView || !activeSplitId) {
      return null
    }
    const members = splitChannels.map((login) => ({
      login,
      channel: channelByLogin.get(login),
    }))
    const names = members.map(({ login, channel }) =>
      channelLabel(channel, login)
    )

    return {
      id: `split:${activeSplitId}`,
      order: SECTION_ORDER.split,
      boost: 0.08,
      showWhenEmpty: true,
      keepItemOrder: true,
      heading: (
        <GroupHeading
          avatar={
            <SplitAvatars
              channels={members.map(({ login, channel }) => ({
                login,
                profileImageUrl: channel?.profileImageUrl,
              }))}
            />
          }
          title={names.join(" + ")}
        />
      ),
      items: withSubject(
        [
          "split",
          ...members.flatMap(({ login, channel }) =>
            channelTerms(login, channel)
          ),
        ],
        [
          splitCandidates.length > 0 && {
            id: "active-split:add",
            title: "Add channel to split",
            keywords: ["add", "join"],
            icon: <CirclePlusIcon />,
            label: "Add channel to split...",
            onSelect: () => pushPage({ kind: "split" }),
          },
          {
            id: "active-split:ungroup",
            title: "Ungroup split",
            keywords: ["unsplit", "separate"],
            icon: <UngroupIcon />,
            label: "Ungroup split",
            onSelect: () =>
              run(() => {
                const nextActive = splitChannels[0]
                unsplit(activeSplitId)
                if (nextActive) {
                  requestComposerFocus(nextActive)
                }
              }),
          },
        ]
      ),
    }
  }

  const buildChannelSection = (channel: TwitchChannel): PaletteGroup | null => {
    const { login } = channel
    if (login === target) {
      return null
    }
    const label = channelLabel(channel, login)
    const inActiveSplit = activeSplitSet.has(login)
    const inOtherSplit = channelsInSplits.has(login) && !inActiveSplit
    const free = !channelsInSplits.has(login)

    let hint: string | undefined
    let items: Array<PaletteCommand | null | false>

    if (inActiveSplit) {
      hint = "In this split"
      items = [
        {
          id: `channel:${login}:focus`,
          title: `Jump to ${label}`,
          keywords: ["focus", "go to", "switch"],
          icon: <CornerDownRightIcon />,
          label: (
            <>
              Jump to <Name>{label}</Name>
            </>
          ),
          onSelect: () => run(() => focusChannel(login)),
        },
        {
          id: `channel:${login}:remove-from-split`,
          title: `Remove ${label} from split`,
          keywords: ["split", "unsplit"],
          icon: <UserMinusIcon />,
          label: (
            <>
              Remove <Name>{label}</Name> from split
            </>
          ),
          onSelect: () => removeFromActiveSplit(login),
        },
        watchChannel(login, label),
        openChannelPage(login),
      ]
    } else if (inOtherSplit) {
      hint = inSplitView ? "In another split" : "In a split"
      items = [
        {
          id: `channel:${login}:go-to-split`,
          title: `Go to ${label}'s split`,
          keywords: ["go to", "switch", "open", "split"],
          icon: <LogInIcon />,
          label: (
            <>
              Go to <Name>{label}</Name>&apos;s split
            </>
          ),
          onSelect: () => run(() => focusChannel(login)),
        },
        watchChannel(login, label),
        openChannelPage(login),
      ]
    } else {
      const addToSplit: PaletteCommand | false = inSplitView &&
        free && {
          id: `channel:${login}:add-to-split`,
          title: `Add ${label} to split`,
          keywords: ["split", "add", "join"],
          icon: <CirclePlusIcon />,
          label: (
            <>
              Add <Name>{label}</Name> to split
            </>
          ),
          onSelect: () => run(() => splitTargetWith(login)),
        }
      const splitWithTarget: PaletteCommand | false = !inSplitView &&
        canSplitWithTarget &&
        free && {
          id: `channel:${login}:split-with-target`,
          title: `Split ${targetLabel} with ${label}`,
          keywords: ["split", "side by side", "multi"],
          icon: <Columns2Icon />,
          label: (
            <>
              Split <Name>{targetName}</Name> with <Name>{label}</Name>
            </>
          ),
          onSelect: () => run(() => splitTargetWith(login)),
        }
      items = [
        addToSplit,
        {
          id: `channel:${login}:go-to`,
          title: `Go to ${label}`,
          keywords: ["go to", "switch", "open"],
          icon: <LogInIcon />,
          label: (
            <>
              Go to <Name>{label}</Name>
            </>
          ),
          onSelect: () => run(() => focusChannel(login)),
        },
        splitWithTarget,
        watchChannel(login, label),
        openChannelPage(login),
        !playerViewActive && removeChannelPrompt(login, label),
      ]
    }

    return {
      id: `channel:${login}`,
      order: SECTION_ORDER.channel,
      kind: "channel",
      subject: channelTerms(login, channel),
      keepItemOrder: true,
      heading: (
        <GroupHeading
          avatar={
            <ChannelAvatar
              login={login}
              profileImageUrl={channel.profileImageUrl}
              className="size-4"
            />
          }
          title={label}
          hint={hint}
          live={isChannelLive(login)}
        />
      ),
      items: withSubject(channelTerms(login, channel), items),
    }
  }

  const buildSplitSections = (): PaletteGroup[] =>
    sidebarEntries.flatMap((entry) => {
      if (entry.kind !== "split") {
        return []
      }
      const split = entry.split
      if (inSplitView && split.id === activeSplitId) {
        return []
      }
      const names = entry.channels.map(
        (channel) =>
          ("displayName" in channel && channel.displayName) || channel.login
      )
      const title = names.join(" + ")
      const firstLogin = split.channels[0]

      return [
        {
          id: `split:${split.id}`,
          order: SECTION_ORDER.channel,
          kind: "channel" as const,
          subject: [...split.channels, ...names],
          keepItemOrder: true,
          heading: (
            <GroupHeading
              avatar={<SplitAvatars channels={entry.channels} />}
              title={title}
              live={isSplitLive(split.channels)}
            />
          ),
          items: withSubject(
            ["split", ...split.channels, ...names],
            [
              {
                id: `split:${split.id}:go-to`,
                title: `Go to ${title}`,
                keywords: ["go to", "switch", "open"],
                icon: <LogInIcon />,
                label: (
                  <>
                    Go to <Name>{title}</Name>
                  </>
                ),
                onSelect: () =>
                  run(() => {
                    selectSplit(split.id)
                    if (firstLogin) {
                      requestComposerFocus(firstLogin)
                    }
                  }),
              },
              {
                id: `split:${split.id}:ungroup`,
                title: "Ungroup split",
                keywords: ["unsplit", "separate"],
                icon: <UngroupIcon />,
                label: "Ungroup split",
                onSelect: () => run(() => unsplit(split.id), "restore"),
              },
            ]
          ),
        },
      ]
    })

  const buildTypedSection = (): PaletteGroup | null => {
    const login = getTypedChannelLogin(query, channelByLogin.keys())
    if (!login) {
      return null
    }

    const addToSplit: PaletteCommand | false = inSplitView && {
      id: `typed:${login}:add-to-split`,
      title: `Add ${login} to split`,
      keywords: ["split", "add", "join"],
      icon: <CirclePlusIcon />,
      label: (
        <>
          Add <Name>{login}</Name> to split
        </>
      ),
      onSelect: () => addTypedChannel(login, "split"),
    }
    const splitWithTarget: PaletteCommand | false = !inSplitView &&
      canSplitWithTarget && {
        id: `typed:${login}:split-with-target`,
        title: `Split ${targetLabel} with ${login}`,
        keywords: ["split", "side by side", "multi"],
        icon: <Columns2Icon />,
        label: (
          <>
            Add and split <Name>{targetName}</Name> with <Name>{login}</Name>
          </>
        ),
        onSelect: () => addTypedChannel(login, "split"),
      }

    return {
      id: `typed:${login}`,
      order: SECTION_ORDER.typed,
      subject: [login],
      boost: FALLBACK_SECTION_BOOST,
      keepItemOrder: true,
      heading: (
        <GroupHeading
          avatar={
            watchedLoginSet.has(login)
              ? renderChannelAvatar(login, "size-4")
              : undefined
          }
          title={renderChannelName(login)}
          hint="Not added"
        />
      ),
      items: withSubject(
        [login],
        [
          addToSplit,
          {
            id: `typed:${login}:add`,
            title: `Add ${login}`,
            keywords: ["add", "join", "new"],
            icon: <PlusIcon />,
            label: (
              <>
                Add <Name>{login}</Name>
              </>
            ),
            onSelect: () => addTypedChannel(login),
          },
          splitWithTarget,
          {
            id: `typed:${login}:add-watch`,
            title: `Add and watch ${login}`,
            keywords: ["add", "watch", "player"],
            icon: <MonitorPlayIcon />,
            label: (
              <>
                Add & watch <Name>{login}</Name>
              </>
            ),
            onSelect: () => addTypedChannel(login, "watch"),
          },
          {
            id: `typed:${login}:watch`,
            title: `Watch ${login} without adding`,
            keywords: ["watch", "player", "preview"],
            icon: <EyeIcon />,
            label: (
              <>
                Watch <Name>{login}</Name> without adding
              </>
            ),
            onSelect: () => run(() => openPlayer(login)),
          },
        ]
      ),
    }
  }

  const buildPlayerSection = (): PaletteGroup | null => {
    if (watchedChannelLogins.length === 0) {
      return null
    }
    return {
      id: "player",
      order: SECTION_ORDER.player,
      boost: 0.02,
      showWhenEmpty: true,
      heading: "Player",
      items: withSubject(
        ["player", "stream", ...watchedChannelLogins],
        [
          !playerViewActive && {
            id: "player:go-to",
            title: "Go to player",
            keywords: ["watch", "video"],
            icon: <MonitorPlayIcon />,
            label: "Go to player",
            trailing: (
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {watchedChannelLogins.length === 1
                  ? renderChannelName(watchedChannelLogins[0])
                  : `${watchedChannelLogins.length} streams`}
              </span>
            ),
            onSelect: () => run(() => selectPlayer()),
          },
          {
            id: "player:close-all",
            title:
              watchedChannelLogins.length === 1
                ? "Close stream"
                : "Close all streams",
            keywords: ["stop", "video"],
            icon: <XIcon />,
            label:
              watchedChannelLogins.length === 1
                ? "Close stream"
                : "Close all streams",
            onSelect: () => run(() => closeAllPlayers(), "restore"),
          },
        ]
      ),
    }
  }

  const buildGeneralSection = (): PaletteGroup => {
    const dndEnabled = config.highlights.doNotDisturbEnabled

    return {
      id: "general",
      order: SECTION_ORDER.general,
      showWhenEmpty: true,
      heading: "General",
      items: withSubject(
        [],
        [
          {
            id: "general:search",
            title: "Search messages",
            keywords: ["find"],
            icon: <SearchIcon />,
            label: "Search messages",
            shortcut: "search.open",
            onSelect: () => run(() => getSearch()?.open()),
          },
          {
            id: "general:add-channel",
            title: "Add channel",
            keywords: ["join", "new"],
            icon: <PlusIcon />,
            label: "Add channel",
            shortcut: "channel.add",
            onSelect: () => run(onOpenAddChannel),
          },
          {
            id: "general:notifications",
            title: "Notification center",
            keywords: ["pings", "mentions", "live", "notifications"],
            icon: <BellIcon />,
            label: "Notification center",
            shortcut: "notifications.open",
            onSelect: () => run(onOpenNotifications),
          },
          unreadNotificationCount > 0 && {
            id: "general:mark-read",
            title: "Mark all notifications as read",
            keywords: ["pings", "clear", "missed"],
            icon: <CheckCheckIcon />,
            label: "Mark all notifications as read",
            onSelect: () =>
              run(() => {
                markAllPingsRead()
                markAllLiveRead()
                markAllMissedRead()
              }, "restore"),
          },
          {
            id: "general:dnd",
            title: dndEnabled
              ? "Turn off do not disturb"
              : "Turn on do not disturb",
            keywords: ["dnd", "mute", "quiet", "notifications"],
            icon: dndEnabled ? <BellRingIcon /> : <BellOffIcon />,
            label: dndEnabled
              ? "Turn off do not disturb"
              : "Turn on do not disturb",
            shortcut: "dnd.toggle",
            onSelect: () => run(toggleDoNotDisturb, "restore"),
          },
          {
            id: "general:sidebar",
            title: channelSidebarVisible
              ? "Hide channel sidebar"
              : "Show channel sidebar",
            keywords: ["toggle", "sidebar"],
            icon: <PanelLeftIcon />,
            label: channelSidebarVisible
              ? "Hide channel sidebar"
              : "Show channel sidebar",
            shortcut: "sidebar.toggle",
            onSelect: () => run(onToggleChannelSidebar, "restore"),
          },
          visibleChannelLogins.length > 0 && {
            id: "general:reload-emotes",
            title: "Reload emotes",
            keywords: ["refresh", "7tv", "bttv", "ffz"],
            icon: <RefreshCcwIcon />,
            label: "Reload emotes",
            shortcut: "emotes.reload",
            onSelect: () =>
              run(() => {
                for (const login of visibleChannelLogins) {
                  void refreshEmotes(login)
                }
              }, "restore"),
          },
        ]
      ),
    }
  }

  const buildPreferencesSection = (): PaletteGroup => ({
    id: "preferences",
    order: SECTION_ORDER.preferences,
    showWhenEmpty: true,
    heading: "Preferences",
    items: [
      {
        id: "preferences:settings",
        title: "Settings",
        keywords: ["preferences", "options", "config"],
        icon: <SettingsIcon />,
        label: "Settings...",
        shortcut: "settings.open",
        onSelect: () => pushPage({ kind: "settings" }),
      },
      {
        id: "preferences:theme",
        title: "Change theme",
        keywords: ["dark", "light", "system", "mode", "appearance"],
        icon: <SunMoonIcon />,
        label: "Change theme...",
        onSelect: () => pushPage({ kind: "theme" }),
      },
      {
        id: "preferences:color-scheme",
        title: "Change color scheme",
        keywords: ["accent", "color", "colour", "appearance"],
        icon: <PaletteIcon />,
        label: "Change color scheme...",
        onSelect: () => pushPage({ kind: "color-scheme" }),
      },
      {
        id: "preferences:shortcuts",
        title: "Keyboard shortcuts",
        keywords: ["hotkeys", "keybinds", "help"],
        icon: <KeyboardIcon />,
        label: "Keyboard shortcuts",
        onSelect: () => run(() => onOpenSettings("help")),
      },
    ],
  })

  const settingsItems = (prefix: boolean): PaletteCommand[] =>
    settingsCategories.map((entry) => ({
      id: `settings:${entry.id}`,
      title: entry.label,
      keywords: ["settings", "preferences", entry.id],
      icon: <entry.icon />,
      label: prefix ? (
        <>
          <span className="text-muted-foreground">Settings: </span>
          {entry.label}
        </>
      ) : (
        entry.label
      ),
      onSelect: () => run(() => onOpenSettings(entry.id)),
    }))

  const themeItems = (prefix: boolean): PaletteCommand[] =>
    THEME_OPTIONS.map((option) => ({
      id: `theme:${option.value}`,
      title: option.label,
      keywords: ["theme", "mode", "appearance"],
      icon: <option.icon />,
      label: prefix ? (
        <>
          <span className="text-muted-foreground">Theme: </span>
          {option.label}
        </>
      ) : (
        option.label
      ),
      checked: theme === option.value,
      onSelect: () => run(() => setTheme(option.value), "restore"),
    }))

  const colorSchemeItems = (prefix: boolean): PaletteCommand[] =>
    COLOR_SCHEME_OPTIONS.map((option) => ({
      id: `color-scheme:${option.value}`,
      title: option.label,
      keywords: ["accent", "color", "colour", "scheme", "appearance"],
      icon: <ColorSwatch color={option.color} />,
      label: prefix ? (
        <>
          <span className="text-muted-foreground">Color scheme: </span>
          {option.label}
        </>
      ) : (
        option.label
      ),
      checked: colorScheme === option.value,
      onSelect: () => run(() => setColorScheme(option.value), "restore"),
    }))

  const buildRootSections = (): PaletteGroup[] => {
    const sections: Array<PaletteGroup | null> = [
      buildCurrentSection(),
      buildActiveSplitSection(),
      buildPlayerSection(),
      buildGeneralSection(),
      buildPreferencesSection(),
    ]

    if (query) {
      sections.push(
        buildTypedSection(),
        ...channels.map(buildChannelSection),
        ...buildSplitSections(),
        {
          id: "settings",
          order: SECTION_ORDER.settings,
          heading: "Settings",
          items: settingsItems(true),
        },
        {
          id: "theme",
          order: SECTION_ORDER.theme,
          heading: "Theme",
          items: themeItems(true),
        },
        {
          id: "color-scheme",
          order: SECTION_ORDER.colorScheme,
          heading: "Color scheme",
          items: colorSchemeItems(true),
        }
      )
    }

    return sections.filter((section): section is PaletteGroup =>
      Boolean(section)
    )
  }

  const buildPageSections = (current: Page): PaletteGroup[] => {
    switch (current.kind) {
      case "settings":
        return [
          {
            id: "page:settings",
            order: 0,
            showWhenEmpty: true,
            keepItemOrder: true,
            heading: "Settings",
            items: settingsItems(false),
          },
        ]
      case "theme":
        return [
          {
            id: "page:theme",
            order: 0,
            showWhenEmpty: true,
            keepItemOrder: true,
            heading: "Theme",
            items: themeItems(false),
          },
        ]
      case "color-scheme":
        return [
          {
            id: "page:color-scheme",
            order: 0,
            showWhenEmpty: true,
            keepItemOrder: true,
            heading: "Color scheme",
            items: colorSchemeItems(false),
          },
        ]
      case "split":
        return [
          {
            id: "page:split",
            order: 0,
            showWhenEmpty: true,
            heading: inSplitView ? "Add to split" : `Split ${targetLabel} with`,
            items: splitCandidates.map((channel) => ({
              id: `split-candidate:${channel.login}`,
              title: channelLabel(channel, channel.login),
              keywords: channelTerms(channel.login, channel),
              icon: (
                <ChannelAvatar
                  login={channel.login}
                  profileImageUrl={channel.profileImageUrl}
                />
              ),
              label: channelLabel(channel, channel.login),
              trailing: isChannelLive(channel.login) ? (
                <LiveBadge className="ml-auto" />
              ) : undefined,
              onSelect: () => run(() => splitTargetWith(channel.login)),
            })),
          },
        ]
      case "remove-channel": {
        const label = channelLabel(
          channelByLogin.get(current.login),
          current.login
        )
        return [
          {
            id: "page:remove",
            order: 0,
            showWhenEmpty: true,
            keepItemOrder: true,
            heading: `Remove ${label}?`,
            items: [
              {
                id: "remove:confirm",
                title: `Remove ${label}`,
                keywords: ["yes", "confirm"],
                icon: <Trash2Icon />,
                label: (
                  <>
                    Remove <Name>{label}</Name>
                  </>
                ),
                destructive: true,
                onSelect: () =>
                  run(() => {
                    removeChannel(current.login)
                    toast(`Removed ${label}`)
                  }, "restore"),
              },
              {
                id: "remove:cancel",
                title: "Cancel",
                keywords: ["no", "back"],
                icon: <XIcon />,
                label: "Cancel",
                onSelect: popPage,
              },
            ],
          },
        ]
      }
    }
  }

  const ranked = rankPaletteSections<PaletteCommand, PaletteGroup>(
    page ? buildPageSections(page) : buildRootSections(),
    query
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" && search.length === 0 && pages.length > 0) {
      event.preventDefault()
      popPage()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-hotkey-surface="command-palette"
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          if (pages.length > 0) {
            event.preventDefault()
            popPage()
          }
        }}
        onCloseAutoFocus={(event) => {
          if (closeFocus === "manual") {
            event.preventDefault()
          }
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a channel or command to run.
        </DialogDescription>
        <Command
          loop
          shouldFilter={false}
          onKeyDown={handleKeyDown}
          className="rounded-none! bg-transparent p-0"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            {page ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={popPage}
                className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {PAGE_LABELS[page.kind]}
              </button>
            ) : null}
            <CommandPrimitive.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={
                page
                  ? PAGE_PLACEHOLDERS[page.kind]
                  : "Search channels and commands..."
              }
              className="h-11 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-[min(26rem,60svh)] p-1">
            {ranked.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              ranked.map(({ section, items }) => (
                <CommandGroup key={section.id} heading={section.heading}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      data-checked={item.checked}
                      onSelect={item.onSelect}
                      className={cn(
                        item.destructive &&
                          "text-destructive data-selected:bg-destructive/10 data-selected:text-destructive *:[svg]:text-destructive data-selected:*:[svg]:text-destructive"
                      )}
                    >
                      {item.icon}
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.trailing}
                      {item.shortcut ? (
                        <Shortcut action={item.shortcut} />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
          <div className="flex items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </KbdGroup>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              Select
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              {page ? "Back" : "Close"}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
