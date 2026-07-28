import * as React from "react"
import {
  AtSignIcon,
  BellIcon,
  BellRingIcon,
  PlusIcon,
  RadioIcon,
} from "lucide-react"

import {
  SidebarChannelAvatar,
  SidebarChannelRow,
  SidebarIconTile,
} from "@/components/sidebar/sidebar-channel-icon"
import { Button } from "@/components/ui/button"
import { useIntersectionVisible } from "@/hooks/use-intersection-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { formatLiveNotificationText } from "@/lib/highlights/notification-center"
import { PingMatchMark } from "@/lib/highlights/ping-match-mark"
import { LANDING_CHANNELS } from "@/lib/landing/landing-channels"
import { LANDING_EMOTES } from "@/lib/landing/landing-emotes"
import { cn } from "@/lib/utils"
import logoSrc from "/branding/full-logo.svg"

type NotificationKind = "ping" | "live"

type ShowcaseNotification = {
  kind: NotificationKind
  title: string
  body: string
  iconSrc: string
}

const DHINKHA_PING_NOTIFICATION: ShowcaseNotification = {
  kind: "ping",
  title: `${LANDING_CHANNELS.dhinkha.displayName} pinged you in #${LANDING_CHANNELS.rcwOwO.displayName}`,
  body: "Hey @rcwOwO, the boss fight is starting!",
  iconSrc: LANDING_CHANNELS.dhinkha.profileImageUrl,
}

const XRAY_PING_NOTIFICATION: ShowcaseNotification = {
  kind: "ping",
  title: `${LANDING_CHANNELS.xrayc4.displayName} pinged you in #${LANDING_CHANNELS.rcwOwO.displayName}`,
  body: "did rcwOwO see that clip?",
  iconSrc: LANDING_CHANNELS.xrayc4.profileImageUrl,
}

const LIVE_NOTIFICATION: ShowcaseNotification = {
  kind: "live",
  title: `${LANDING_CHANNELS.toastercat.displayName} just went live!`,
  body: formatLiveNotificationText(
    "Hollow Knight: Silksong",
    "blind first playthrough let's go"
  ),
  iconSrc: LANDING_CHANNELS.toastercat.profileImageUrl,
}

const NOTIFICATIONS = [
  DHINKHA_PING_NOTIFICATION,
  XRAY_PING_NOTIFICATION,
  LIVE_NOTIFICATION,
] as const

const NOTIFICATION_ENTER_MS = 720
const NOTIFICATION_HOLD_MS = 4000
const NOTIFICATION_EXIT_MS = 580

type StaticMessagePart =
  | { type: "text"; value: string }
  | { type: "emote"; name: string; url: string }
  | { type: "ping"; value: string }

type StaticMessage = {
  id: string
  user: string
  color: string
  timestamp: string
  parts: StaticMessagePart[]
  pingHighlighted?: boolean
}

const SHOWCASE_MESSAGES: StaticMessage[] = [
  {
    id: "1",
    user: "Realviewer67",
    color: "#ff6b9d",
    timestamp: "21:14",
    parts: [
      { type: "text", value: "this stream is actually insane " },
      { type: "emote", ...LANDING_EMOTES.KEKW },
    ],
  },
  {
    id: "2",
    user: "catgoesMEOW",
    color: "#8ab4ff",
    timestamp: "21:15",
    parts: [
      { type: "emote", ...LANDING_EMOTES.om },
      { type: "text", value: " bro genuinely who asked" },
    ],
  },
  {
    id: "3",
    user: LANDING_CHANNELS.dhinkha.displayName,
    color: "#f4a261",
    timestamp: "21:16",
    pingHighlighted: true,
    parts: [
      { type: "text", value: "Hey " },
      { type: "ping", value: "@rcwOwO" },
      { type: "text", value: ", the boss fight is starting!" },
    ],
  },
  {
    id: "4",
    user: "HappyTacos",
    color: "#56cfe1",
    timestamp: "21:16",
    parts: [{ type: "text", value: "im nothing like that depressedtacos guy" }],
  },
  {
    id: "5",
    user: LANDING_CHANNELS.xrayc4.displayName,
    color: "#9b8cff",
    timestamp: "21:17",
    pingHighlighted: true,
    parts: [
      { type: "text", value: "did " },
      { type: "ping", value: "rcwOwO" },
      { type: "text", value: " see that clip?" },
    ],
  },
  {
    id: "6",
    user: "lurker1_01",
    color: "#a8dadc",
    timestamp: "21:18",
    parts: [{ type: "text", value: "still here, great stream" }],
  },
]

const SIDEBAR_CHANNELS = [
  { channel: LANDING_CHANNELS.rcwOwO, isActive: true, showPing: true },
  { channel: LANDING_CHANNELS.dhinkha, isActive: false, showPing: false },
  { channel: LANDING_CHANNELS.toastercat, isActive: false, showPing: false },
  { channel: LANDING_CHANNELS.xrayc4, isActive: false, showPing: false },
] as const

type MotionPhase = "enter" | "hold" | "exit"

type NotificationPhase = {
  kind: MotionPhase
  notificationIndex: number
  duration: number
}

const NOTIFICATION_PHASES: NotificationPhase[] = NOTIFICATIONS.flatMap(
  (_, notificationIndex) => [
    {
      kind: "enter",
      notificationIndex,
      duration: NOTIFICATION_ENTER_MS,
    },
    {
      kind: "hold",
      notificationIndex,
      duration: NOTIFICATION_HOLD_MS,
    },
    {
      kind: "exit",
      notificationIndex,
      duration: NOTIFICATION_EXIT_MS,
    },
  ]
)

const PROGRESS_RENDER_INTERVAL_MS = 32

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInCubic(t: number) {
  return t * t * t
}

function getNotificationMotion(phase: MotionPhase, progress: number) {
  const eased =
    phase === "exit" ? easeInCubic(progress) : easeOutCubic(progress)

  switch (phase) {
    case "enter":
      return {
        opacity: eased,
        translateX: (1 - eased) * 32,
        translateY: (1 - eased) * 20,
        scale: 0.9 + eased * 0.1,
        floating: false,
      }
    case "hold":
      return {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        floating: true,
      }
    case "exit":
      return {
        opacity: 1 - eased,
        translateX: eased * 18,
        translateY: eased * 14,
        scale: 1 - eased * 0.05,
        floating: false,
      }
  }
}

function useNotificationShowcaseAnimation(
  active: boolean,
  reducedMotion: boolean
) {
  const [phaseIndex, setPhaseIndex] = React.useState(0)
  const [progress, setProgress] = React.useState(() => (reducedMotion ? 1 : 0))
  const activeRef = React.useRef(active)

  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  const phase = NOTIFICATION_PHASES[phaseIndex % NOTIFICATION_PHASES.length]

  React.useEffect(() => {
    if (!active || reducedMotion) {
      return
    }

    let frame = 0
    let start = performance.now()
    let lastRender = 0
    let pausedAt = 0
    const duration = phase.duration

    const tick = (now: number) => {
      if (!activeRef.current) {
        return
      }

      if (document.hidden) {
        if (pausedAt === 0) {
          pausedAt = now
        }
        frame = requestAnimationFrame(tick)
        return
      }

      if (pausedAt > 0) {
        start += now - pausedAt
        pausedAt = 0
      }

      const elapsed = now - start
      const linear = Math.min(elapsed / duration, 1)

      if (now - lastRender >= PROGRESS_RENDER_INTERVAL_MS || linear >= 1) {
        lastRender = now
        setProgress(linear)
      }

      if (linear < 1) {
        frame = requestAnimationFrame(tick)
        return
      }

      setPhaseIndex((current) => (current + 1) % NOTIFICATION_PHASES.length)
      setProgress(0)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [active, phase.duration, phaseIndex, reducedMotion])

  const notification =
    NOTIFICATIONS[
      reducedMotion ? 0 : (phase?.notificationIndex ?? 0) % NOTIFICATIONS.length
    ] ?? DHINKHA_PING_NOTIFICATION

  const motion = reducedMotion
    ? {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        floating: false,
      }
    : getNotificationMotion(phase.kind, progress)

  return { notification, motion, reducedMotion }
}

function staticMessagePartKey(
  messageId: string,
  part: StaticMessagePart,
  offset: number
): string {
  if (part.type === "emote") {
    return `${messageId}-emote-${offset}-${part.url}`
  }

  if (part.type === "ping") {
    return `${messageId}-ping-${offset}-${part.value}`
  }

  return `${messageId}-text-${offset}-${part.value}`
}

function renderStaticMessageParts(message: StaticMessage) {
  let offset = 0
  const nodes: React.ReactNode[] = []

  for (const part of message.parts) {
    const key = staticMessagePartKey(message.id, part, offset)
    if (part.type === "emote") {
      nodes.push(
        <img
          key={key}
          src={part.url}
          alt={part.name}
          title={part.name}
          className="mx-0.5 inline-block h-[1.35em] w-auto align-[-0.2em]"
          draggable={false}
        />
      )
      offset += part.name.length
      continue
    }

    if (part.type === "ping") {
      nodes.push(<PingMatchMark key={key}>{part.value}</PingMatchMark>)
      offset += part.value.length
      continue
    }

    nodes.push(<span key={key}>{part.value}</span>)
    offset += part.value.length
  }

  return nodes
}

function StaticMessageRow({
  message,
  alternate,
}: {
  message: StaticMessage
  alternate: boolean
}) {
  return (
    <div
      className={cn(
        "chat-message chat-message-size px-2.5 py-0.5",
        alternate && "chat-message--alternate",
        message.pingHighlighted && "chat-message--ping-highlight"
      )}
    >
      <span className="chat-timestamp mr-1.5 text-[0.85em] tabular-nums">
        {message.timestamp}
      </span>
      <span className="font-semibold" style={{ color: message.color }}>
        {message.user}
      </span>
      <span className="chat-colon mx-0.5">:</span>
      <span className="chat-message-text">
        {renderStaticMessageParts(message)}
      </span>
    </div>
  )
}

function NotificationsShowcaseChat() {
  const channel = LANDING_CHANNELS.rcwOwO

  return (
    <div className="overflow-hidden rounded-lg border border-border/85 bg-background shadow-[0_2px_4px_oklch(0_0_0/22%),0_18px_40px_-14px_oklch(0_0_0/48%)]">
      <header className="flex h-10 items-center justify-between border-b border-border bg-sidebar px-3.5">
        <img src={logoSrc} alt="" className="h-5 w-auto brand-mark" />
        <div className="flex items-center gap-1.5">
          <span className="size-6 rounded-full bg-primary/20" />
          <span className="relative flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <BellIcon className="size-3.5" />
            <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-[#f23f43] ring-2 ring-sidebar" />
          </span>
        </div>
      </header>

      <div className="flex h-[min(19.5rem,52vw)] min-h-60">
        <aside
          className="flex w-[4.375rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
          style={{ "--sidebar-width-icon": "4.375rem" } as React.CSSProperties}
        >
          <div className="flex flex-col items-stretch gap-3 px-0 py-3">
            {SIDEBAR_CHANNELS.map(({ channel: entry, isActive, showPing }) => (
              <SidebarChannelRow
                key={entry.displayName}
                isActive={isActive}
                showUnread={false}
              >
                <SidebarIconTile
                  isActive={isActive}
                  showPing={showPing}
                  showLive={"live" in entry && entry.live === true}
                >
                  <SidebarChannelAvatar
                    login={entry.displayName}
                    profileImageUrl={entry.profileImageUrl}
                  />
                </SidebarIconTile>
              </SidebarChannelRow>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-center p-1.5">
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0"
              tabIndex={-1}
              aria-hidden
            >
              <PlusIcon className="size-4 shrink-0" />
            </Button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--chat-background)">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
            <img
              src={channel.profileImageUrl}
              alt=""
              className="size-6 shrink-0 rounded-full object-cover"
            />
            <span className="truncate text-sm font-medium">
              {channel.displayName}
            </span>
          </div>

          <div className="chat-scroll min-h-0 flex-1 overflow-hidden py-1">
            <div className="chat-presentation chat-presentation--alternating-rows">
              {SHOWCASE_MESSAGES.map((message, index) => (
                <StaticMessageRow
                  key={message.id}
                  message={message}
                  alternate={index % 2 === 1}
                />
              ))}
            </div>
          </div>

          <div className="h-8 shrink-0 border-t border-border/60 px-2.5 py-1.5">
            <div className="h-full rounded-md border border-border/50 bg-background/40" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BrowserNotificationCard({
  notification,
  motion,
  className,
}: {
  notification: ShowcaseNotification
  motion: ReturnType<typeof getNotificationMotion>
  className?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-none w-fit max-w-[min(100vw-3rem,19.5rem)] rounded-2xl border border-white/14 bg-[color-mix(in_oklch,var(--card)_90%,black)] p-3.5 shadow-[0_4px_6px_oklch(0_0_0/18%),0_22px_48px_-12px_oklch(0_0_0/72%),0_0_0_1px_oklch(1_0_0/8%)] backdrop-blur-xl will-change-[transform,opacity]",
        motion.floating && "landing-notification-float",
        className
      )}
      style={{
        opacity: motion.opacity,
        transform: `translate3d(${motion.translateX}px, ${motion.translateY}px, 0) scale(${motion.scale})`,
        transformOrigin: "bottom right",
      }}
      aria-hidden
    >
      <div className="flex gap-3">
        <img
          src={notification.iconSrc}
          alt=""
          className="size-11 shrink-0 rounded-xl object-cover shadow-[0_2px_8px_oklch(0_0_0/35%)]"
        />
        <div className="min-w-0">
          <p className="text-[0.9rem] leading-snug font-semibold text-foreground">
            {notification.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {notification.body}
          </p>
        </div>
      </div>
    </div>
  )
}

function NotificationsShowcaseDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const { ref: visibilityRef, visible } =
    useIntersectionVisible<HTMLDivElement>({
      rootMargin: "120px",
    })
  const { notification, motion } = useNotificationShowcaseAnimation(
    visible,
    reducedMotion
  )

  return (
    <div
      ref={visibilityRef}
      className="relative mx-auto w-full max-w-136 overflow-visible pr-4 pb-6 sm:pr-6 sm:pb-8"
      aria-hidden
    >
      <NotificationsShowcaseChat />

      <div className="absolute right-0 bottom-0 z-20 sm:-right-1 sm:-bottom-1">
        {reducedMotion ? (
          <div className="flex flex-col items-end gap-2.5">
            {NOTIFICATIONS.map((entry) => (
              <BrowserNotificationCard
                key={entry.title}
                notification={entry}
                motion={{
                  opacity: 1,
                  translateX: 0,
                  translateY: 0,
                  scale: 1,
                  floating: false,
                }}
              />
            ))}
          </div>
        ) : (
          <BrowserNotificationCard
            notification={notification}
            motion={motion}
          />
        )}
      </div>
    </div>
  )
}

const HIGHLIGHTS = [
  {
    icon: AtSignIcon,
    title: "Pings",
    description:
      "You pick the keywords or phrases that'll trigger a notification or highlight in chat.",
  },
  {
    icon: RadioIcon,
    title: "Livestreams",
    description:
      "Get a notification the moment a channel in your sidebar goes live.",
  },
  {
    icon: BellRingIcon,
    title: "Your choice",
    description:
      "Don't want a ping to notify you? You can disable it or turn on do not disturb mode.",
  },
] as const

export function NotificationsShowcaseSection() {
  return (
    <section
      id="notifications"
      className="relative overflow-hidden border-t border-white/8 bg-card/20"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_55%_at_22%_42%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_68%),radial-gradient(ellipse_42%_48%_at_88%_72%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_62%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <NotificationsShowcaseDemo />

          <div className="max-w-xl lg:justify-self-end">
            <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Never miss a
              <br />
              <span className="text-primary">message or stream.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Peepochat can send you browser notifications for when someone
              triggers your pings, or when someone in your sidebar goes live.
            </p>

            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="mt-0.5 inline-flex h-full rounded-lg bg-primary/15 p-2">
                    <item.icon className="size-4 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
