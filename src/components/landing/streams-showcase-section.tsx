import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisIcon,
  EyeIcon,
  MessagesSquareIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { LandingChatSkeleton } from "@/components/landing/landing-chat-skeleton"
import {
  SidebarChannelAvatar,
  SidebarChannelRow,
  SidebarIconTile,
  SidebarPlayingBadge,
  SidebarSplitAvatarCluster,
} from "@/components/sidebar/sidebar-channel-icon"
import { Button } from "@/components/ui/button"
import { useIntersectionVisible } from "@/hooks/use-intersection-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import {
  LANDING_CHANNELS,
  type LandingChannel,
} from "@/lib/landing/landing-channels"
import { formatViewerCount } from "@/lib/twitch/channel/stream-display"
import { cn } from "@/lib/utils"

type ShowcaseStream = {
  channel: LandingChannel
  viewerCount: number
  scene: string
}

const PRIMARY_STREAM: ShowcaseStream = {
  channel: LANDING_CHANNELS.rcwOwO,
  viewerCount: 1284,
  scene:
    "radial-gradient(ellipse 70% 60% at 28% 22%, oklch(0.58 0.17 305 / 55%), transparent 70%), radial-gradient(ellipse 60% 55% at 82% 88%, oklch(0.52 0.16 350 / 45%), transparent 72%), linear-gradient(160deg, oklch(0.24 0.06 300), oklch(0.14 0.04 330))",
}

const SECONDARY_STREAM: ShowcaseStream = {
  channel: LANDING_CHANNELS.dhinkha,
  viewerCount: 842,
  scene:
    "radial-gradient(ellipse 70% 60% at 72% 20%, oklch(0.6 0.12 200 / 50%), transparent 70%), radial-gradient(ellipse 65% 55% at 18% 86%, oklch(0.5 0.13 160 / 42%), transparent 72%), linear-gradient(200deg, oklch(0.23 0.05 220), oklch(0.13 0.03 180))",
}

const SIDEBAR_CHANNELS = [
  LANDING_CHANNELS.toastercat,
  LANDING_CHANNELS.xrayc4,
] as const

const SPLIT_EVEN = 0.5
const SPLIT_RESIZED = 0.66
const CURSOR_Y = 0.56
const PROGRESS_RENDER_INTERVAL_MS = 32

type PhaseKind =
  | "single"
  | "join"
  | "pair"
  | "cursor-arrive"
  | "resize"
  | "to-switcher"
  | "menu"
  | "select"
  | "switched"
  | "part"

const PHASES: { kind: PhaseKind; duration: number }[] = [
  { kind: "single", duration: 2200 },
  { kind: "join", duration: 1200 },
  { kind: "pair", duration: 900 },
  { kind: "cursor-arrive", duration: 700 },
  { kind: "resize", duration: 1500 },
  { kind: "to-switcher", duration: 1000 },
  { kind: "menu", duration: 1200 },
  { kind: "select", duration: 700 },
  { kind: "switched", duration: 1800 },
  { kind: "part", duration: 1100 },
]

type ChatChannel = "primary" | "secondary"

type CursorAnchor =
  | { kind: "divider"; share: number; dx?: number; dy?: number }
  | { kind: "trigger" | "item"; dx?: number; dy?: number }

type ShowcaseCursor = {
  from: CursorAnchor
  to: CursorAnchor
  t: number
  opacity: number
  pressing: boolean
}

type StreamsFrame = {
  primaryShare: number
  secondaryOpacity: number
  headerReveal: number
  dividerActive: boolean
  watchingBoth: boolean
  switcherActive: boolean
  menuOpacity: number
  highlightSecondary: boolean
  chatChannel: ChatChannel
  cursor: ShowcaseCursor | null
}

const PAIR_FRAME: StreamsFrame = {
  primaryShare: SPLIT_EVEN,
  secondaryOpacity: 1,
  headerReveal: 1,
  dividerActive: false,
  watchingBoth: true,
  switcherActive: false,
  menuOpacity: 0,
  highlightSecondary: false,
  chatChannel: "primary",
  cursor: null,
}

const SINGLE_FRAME: StreamsFrame = {
  ...PAIR_FRAME,
  primaryShare: 1,
  secondaryOpacity: 0,
  headerReveal: 0,
  watchingBoth: false,
}

const RESIZED_FRAME: StreamsFrame = {
  ...PAIR_FRAME,
  primaryShare: SPLIT_RESIZED,
}

const STATIC_FRAME = RESIZED_FRAME

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInCubic(t: number) {
  return t * t * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function computeFrame(kind: PhaseKind, progress: number): StreamsFrame {
  switch (kind) {
    case "single":
      return SINGLE_FRAME
    case "join": {
      const t = easeInOutCubic(progress)
      return {
        ...PAIR_FRAME,
        primaryShare: lerp(1, SPLIT_EVEN, t),
        secondaryOpacity: easeOutCubic(clamp01((progress - 0.1) / 0.9)),
        headerReveal: t,
        watchingBoth: progress >= 0.35,
      }
    }
    case "pair":
      return PAIR_FRAME
    case "cursor-arrive": {
      const pressing = progress >= 0.85
      return {
        ...PAIR_FRAME,
        dividerActive: pressing,
        cursor: {
          from: { kind: "divider", share: SPLIT_EVEN, dx: 0.14, dy: 0.24 },
          to: { kind: "divider", share: SPLIT_EVEN },
          t: easeInOutCubic(progress),
          opacity: clamp01(progress / 0.3),
          pressing,
        },
      }
    }
    case "resize": {
      const share = lerp(SPLIT_EVEN, SPLIT_RESIZED, easeInOutCubic(progress))
      const anchor: CursorAnchor = { kind: "divider", share }
      return {
        ...PAIR_FRAME,
        primaryShare: share,
        dividerActive: true,
        cursor: { from: anchor, to: anchor, t: 0, opacity: 1, pressing: true },
      }
    }
    case "to-switcher": {
      const pressing = progress < 0.1 || progress >= 0.88
      return {
        ...RESIZED_FRAME,
        dividerActive: progress < 0.1,
        switcherActive: progress >= 0.88,
        cursor: {
          from: { kind: "divider", share: SPLIT_RESIZED },
          to: { kind: "trigger" },
          t: easeInOutCubic(clamp01((progress - 0.1) / 0.75)),
          opacity: 1,
          pressing,
        },
      }
    }
    case "menu":
      return {
        ...RESIZED_FRAME,
        switcherActive: true,
        menuOpacity: easeOutCubic(clamp01(progress / 0.2)),
        highlightSecondary: progress >= 0.6,
        cursor: {
          from: { kind: "trigger" },
          to: { kind: "item" },
          t: easeInOutCubic(clamp01((progress - 0.25) / 0.45)),
          opacity: 1,
          pressing: progress >= 0.88,
        },
      }
    case "select": {
      const t = easeInCubic(progress)
      return {
        ...RESIZED_FRAME,
        switcherActive: progress < 0.3,
        menuOpacity: 1 - easeOutCubic(clamp01(progress / 0.3)),
        highlightSecondary: true,
        chatChannel: "secondary",
        cursor: {
          from: { kind: "item" },
          to: { kind: "item", dx: 0.06, dy: 0.14 },
          t,
          opacity: 1 - t,
          pressing: progress < 0.15,
        },
      }
    }
    case "switched":
      return { ...RESIZED_FRAME, chatChannel: "secondary" }
    case "part": {
      const t = easeInOutCubic(progress)
      const watchingBoth = progress < 0.65
      return {
        ...RESIZED_FRAME,
        primaryShare: lerp(SPLIT_RESIZED, 1, t),
        secondaryOpacity: 1 - easeOutCubic(clamp01(progress / 0.6)),
        headerReveal: 1 - t,
        watchingBoth,
        chatChannel: watchingBoth ? "secondary" : "primary",
      }
    }
  }
}

function useStreamsShowcaseAnimation(active: boolean, reducedMotion: boolean) {
  const [phaseIndex, setPhaseIndex] = React.useState(0)
  const [progress, setProgress] = React.useState(0)
  const activeRef = React.useRef(active)

  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  const phase = PHASES[phaseIndex % PHASES.length] ?? PHASES[0]!

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

      setPhaseIndex((current) => (current + 1) % PHASES.length)
      setProgress(0)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [active, phase.duration, phaseIndex, reducedMotion])

  if (reducedMotion) {
    return STATIC_FRAME
  }

  return computeFrame(phase.kind, progress)
}

type Point = { x: number; y: number }

type Box = Point & { width: number; height: number }

type DemoMetrics = {
  width: number
  height: number
  video: Box
  trigger: Point
  item: Point
}

const STREAMS_BY_CHANNEL: Record<ChatChannel, ShowcaseStream> = {
  primary: PRIMARY_STREAM,
  secondary: SECONDARY_STREAM,
}

function resolveAnchor(anchor: CursorAnchor, metrics: DemoMetrics): Point {
  const base =
    anchor.kind === "divider"
      ? {
          x: metrics.video.x + anchor.share * metrics.video.width,
          y: metrics.video.y + CURSOR_Y * metrics.video.height,
        }
      : metrics[anchor.kind]

  return {
    x: base.x + (anchor.dx ?? 0) * metrics.width,
    y: base.y + (anchor.dy ?? 0) * metrics.height,
  }
}

function useDemoMetrics(
  frameRef: React.RefObject<HTMLDivElement | null>,
  videoRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLSpanElement | null>,
  itemRef: React.RefObject<HTMLDivElement | null>
) {
  const [metrics, setMetrics] = React.useState<DemoMetrics | null>(null)

  React.useLayoutEffect(() => {
    const frame = frameRef.current
    const video = videoRef.current
    const trigger = triggerRef.current
    const item = itemRef.current

    if (!frame || !video || !trigger || !item) {
      return
    }

    const measure = () => {
      const origin = frame.getBoundingClientRect()
      const box = (element: HTMLElement): Box => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
        }
      }
      const center = (element: HTMLElement): Point => {
        const rect = box(element)
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      }

      setMetrics({
        width: origin.width,
        height: origin.height,
        video: box(video),
        trigger: center(trigger),
        item: center(item),
      })
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(video)

    return () => observer.disconnect()
  }, [frameRef, videoRef, triggerRef, itemRef])

  return metrics
}

function DemoCursor({
  point,
  cursor,
}: {
  point: Point
  cursor: ShowcaseCursor
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-lg motion-safe:animate-pulse",
        cursor.pressing && "scale-90"
      )}
      style={{
        left: `${point.x}px`,
        top: `${point.y}px`,
        opacity: cursor.opacity,
      }}
      aria-hidden
    />
  )
}

function pct(value: number) {
  return `${value * 100}%`
}

function StreamPaneHeader({
  stream,
  reveal,
}: {
  stream: ShowcaseStream
  reveal: number
}) {
  return (
    <div
      className="shrink-0 overflow-hidden border-b border-border bg-sidebar"
      style={{ height: `${reveal * 2}rem`, opacity: reveal }}
    >
      <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <img
            src={stream.channel.profileImageUrl}
            alt=""
            draggable={false}
            className="size-5 shrink-0 rounded-full object-cover"
          />
          <span className="min-w-0 truncate text-xs font-medium">
            {stream.channel.displayName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-red-500 tabular-nums">
            <EyeIcon className="size-3" />
            {formatViewerCount(stream.viewerCount)}
          </span>
          <XIcon className="size-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

function StreamVideo({ stream }: { stream: ShowcaseStream }) {
  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      style={{ background: stream.scene }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_50%_45%,transparent_45%,oklch(0_0_0/55%))]" />
      <span className="absolute top-2 left-2 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white">
        LIVE
      </span>
      <div className="absolute right-2 bottom-2 aspect-4/3 w-[30%] max-w-16 min-w-8 overflow-hidden rounded-sm shadow-[0_4px_12px_oklch(0_0_0/45%)] ring-1 ring-white/15">
        <img
          src={stream.channel.profileImageUrl}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      </div>
    </div>
  )
}

function StreamPane({
  stream,
  left,
  right,
  headerReveal,
  opacity = 1,
}: {
  stream: ShowcaseStream
  left: number
  right: number
  headerReveal: number
  opacity?: number
}) {
  return (
    <div
      className="absolute inset-y-0 flex min-w-0 flex-col overflow-hidden"
      style={{ left: pct(left), right: pct(right), opacity }}
    >
      {headerReveal > 0.01 ? (
        <StreamPaneHeader stream={stream} reveal={headerReveal} />
      ) : null}
      <StreamVideo stream={stream} />
    </div>
  )
}

function ChatSwitcherOption({
  stream,
  selected,
  highlighted,
  itemRef,
}: {
  stream: ShowcaseStream
  selected: boolean
  highlighted: boolean
  itemRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={itemRef}
      className={cn(
        "relative flex items-center gap-1.5 rounded-md py-1 pr-7 pl-1.5 text-xs transition-colors duration-150",
        highlighted && "bg-foreground/10"
      )}
    >
      <img
        src={stream.channel.profileImageUrl}
        alt=""
        draggable={false}
        className="size-5 shrink-0 rounded-full object-cover"
      />
      <span className="min-w-0 flex-1 truncate">
        {stream.channel.displayName}
      </span>
      <span className="shrink-0 text-[11px] text-red-500 tabular-nums">
        {formatViewerCount(stream.viewerCount)}
      </span>
      {selected ? (
        <CheckIcon className="absolute right-2 size-3.5 text-foreground" />
      ) : null}
    </div>
  )
}

function ShowcaseChat({
  chatChannel,
  watchingBoth,
  switcherActive,
  menuOpacity,
  highlightSecondary,
  triggerRef,
  itemRef,
}: {
  chatChannel: ChatChannel
  watchingBoth: boolean
  switcherActive: boolean
  menuOpacity: number
  highlightSecondary: boolean
  triggerRef: React.Ref<HTMLSpanElement>
  itemRef: React.Ref<HTMLDivElement>
}) {
  const stream = STREAMS_BY_CHANNEL[chatChannel]
  const menuVisible = menuOpacity > 0.01

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--chat-background) sm:w-[34%] sm:flex-none lg:w-72">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={stream.channel.profileImageUrl}
            alt=""
            draggable={false}
            className="size-6 shrink-0 rounded-full object-cover"
          />
          <span className="truncate text-sm font-medium">
            {stream.channel.displayName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            ref={triggerRef}
            className={cn(
              "inline-flex h-6 items-center gap-0.5 rounded-md px-1 text-muted-foreground transition-[opacity,background-color,color] duration-200",
              switcherActive && "bg-foreground/10 text-foreground"
            )}
            style={{ opacity: watchingBoth ? 1 : 0 }}
          >
            <MessagesSquareIcon className="size-3.5" />
            <ChevronDownIcon className="size-3" />
          </span>
          <span className="inline-flex size-6 items-center justify-center text-muted-foreground">
            <EllipsisIcon className="size-3.5" />
          </span>
        </div>
      </div>

      <div
        className="absolute top-10 right-2 z-20 w-52 max-w-[calc(100%-1rem)] rounded-lg bg-popover/90 p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-2xl"
        style={{
          opacity: menuOpacity,
          visibility: menuVisible ? "visible" : "hidden",
        }}
      >
        <p className="px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
          Show chat for
        </p>
        <ChatSwitcherOption
          stream={PRIMARY_STREAM}
          selected={chatChannel === "primary"}
          highlighted={false}
        />
        <ChatSwitcherOption
          stream={SECONDARY_STREAM}
          selected={chatChannel === "secondary"}
          highlighted={highlightSecondary}
          itemRef={itemRef}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          key={chatChannel}
          className="h-full animate-landing-fade-up-short motion-reduce:animate-none"
        >
          <LandingChatSkeleton seed={chatChannel === "primary" ? 41 : 53} />
        </div>
      </div>

      <div className="h-8 shrink-0 border-t border-border/60 px-2.5 py-1.5">
        <div className="h-full rounded-md border border-border/50 bg-background/40" />
      </div>
    </div>
  )
}

function ShowcasePlayerButton({ watchingBoth }: { watchingBoth: boolean }) {
  return (
    <SidebarChannelRow isActive showUnread={false}>
      <span className="relative block size-11 shrink-0">
        <span className="flex size-11 shrink-0 overflow-hidden rounded-full bg-secondary ring-2 ring-primary">
          {watchingBoth ? (
            <SidebarSplitAvatarCluster
              channels={[PRIMARY_STREAM, SECONDARY_STREAM].map((stream) => ({
                login: stream.channel.displayName,
                profileImageUrl: stream.channel.profileImageUrl,
              }))}
            />
          ) : (
            <SidebarChannelAvatar
              login={PRIMARY_STREAM.channel.displayName}
              profileImageUrl={PRIMARY_STREAM.channel.profileImageUrl}
            />
          )}
        </span>
        <SidebarPlayingBadge />
      </span>
    </SidebarChannelRow>
  )
}

function ShowcaseSidebar({ watchingBoth }: { watchingBoth: boolean }) {
  return (
    <aside
      className="flex w-[4.375rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ "--sidebar-width-icon": "4.375rem" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-3 pt-3">
        <ShowcasePlayerButton watchingBoth={watchingBoth} />
        <div className="mb-3 h-px w-10 bg-sidebar-border" />
      </div>
      <div className="flex flex-col items-stretch gap-3 pb-3">
        {SIDEBAR_CHANNELS.map((channel) => (
          <SidebarChannelRow
            key={channel.displayName}
            isActive={false}
            showUnread={false}
          >
            <SidebarIconTile
              isActive={false}
              showPing={false}
              showLive={"live" in channel && channel.live === true}
            >
              <SidebarChannelAvatar
                login={channel.displayName}
                profileImageUrl={channel.profileImageUrl}
              />
            </SidebarIconTile>
          </SidebarChannelRow>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-center p-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          tabIndex={-1}
          aria-hidden
        >
          <PlusIcon className="size-5 shrink-0" strokeWidth={2.5} />
        </Button>
      </div>
    </aside>
  )
}

function StreamsShowcaseDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const { ref: visibilityRef, visible } =
    useIntersectionVisible<HTMLDivElement>({
      rootMargin: "120px",
    })
  const frameRef = React.useRef<HTMLDivElement>(null)
  const videoRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLSpanElement>(null)
  const itemRef = React.useRef<HTMLDivElement>(null)
  const metrics = useDemoMetrics(frameRef, videoRef, triggerRef, itemRef)
  const frame = useStreamsShowcaseAnimation(visible, reducedMotion)
  const { primaryShare, secondaryOpacity, headerReveal, cursor } = frame
  const showSecondary = primaryShare < 0.999

  const cursorPoint = (() => {
    if (!cursor || !metrics || cursor.opacity <= 0.01) {
      return null
    }
    const from = resolveAnchor(cursor.from, metrics)
    const to = resolveAnchor(cursor.to, metrics)
    return { x: lerp(from.x, to.x, cursor.t), y: lerp(from.y, to.y, cursor.t) }
  })()

  return (
    <div
      ref={visibilityRef}
      className="relative mx-auto w-full max-w-5xl"
      aria-hidden
    >
      <div
        ref={frameRef}
        className="relative flex h-104 overflow-hidden rounded-lg border border-border/85 bg-background shadow-[0_2px_4px_oklch(0_0_0/22%),0_18px_40px_-14px_oklch(0_0_0/48%)] sm:aspect-16/9 sm:h-auto lg:aspect-2/1"
      >
        <ShowcaseSidebar watchingBoth={frame.watchingBoth} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
          <div
            ref={videoRef}
            className="relative isolate aspect-video w-full shrink-0 overflow-hidden bg-black sm:aspect-auto sm:w-auto sm:flex-1"
          >
            <StreamPane
              stream={PRIMARY_STREAM}
              left={0}
              right={1 - primaryShare}
              headerReveal={headerReveal}
            />

            {showSecondary ? (
              <>
                <StreamPane
                  stream={SECONDARY_STREAM}
                  left={primaryShare}
                  right={0}
                  headerReveal={headerReveal}
                  opacity={secondaryOpacity}
                />
                <div
                  className={cn(
                    "absolute inset-y-0 z-10 -ml-px w-px bg-border transition-[background-color,box-shadow] duration-200",
                    frame.dividerActive &&
                      "bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
                  )}
                  style={{ left: pct(primaryShare), opacity: secondaryOpacity }}
                />
              </>
            ) : null}
          </div>

          <div className="h-px w-full shrink-0 bg-border sm:h-auto sm:w-px" />

          <ShowcaseChat
            chatChannel={frame.chatChannel}
            watchingBoth={frame.watchingBoth}
            switcherActive={frame.switcherActive}
            menuOpacity={frame.menuOpacity}
            highlightSecondary={frame.highlightSecondary}
            triggerRef={triggerRef}
            itemRef={itemRef}
          />
        </div>

        {cursor && cursorPoint ? (
          <DemoCursor point={cursorPoint} cursor={cursor} />
        ) : null}
      </div>
    </div>
  )
}

export function StreamsShowcaseSection() {
  return (
    <section
      id="streams"
      className="relative overflow-hidden border-t border-white/8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,oklch(0_0_0/45%)_35%,oklch(0_0_0/45%)_75%,transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20 lg:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Watch the stream
            <br />
            <span className="text-primary">right next to chat.</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Peepochat has its own player built in. Watch one stream or a few at
            once, and switch between their chats without ever leaving the
            client.
          </p>
        </div>

        <div className="relative mt-12 lg:mt-16">
          <div
            className="pointer-events-none absolute -inset-x-6 -inset-y-10 rounded-[50%] opacity-60 blur-3xl sm:-inset-x-16"
            style={{
              background: `radial-gradient(ellipse 45% 60% at 35% 50%, oklch(0.58 0.17 305 / 55%), transparent 70%), radial-gradient(ellipse 40% 55% at 68% 52%, oklch(0.6 0.12 200 / 45%), transparent 70%)`,
            }}
            aria-hidden
          />
          <div className="relative">
            <StreamsShowcaseDemo />
          </div>
        </div>
      </div>
    </section>
  )
}
