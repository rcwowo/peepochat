import * as React from "react"
import { BellIcon, PlusIcon } from "lucide-react"

import {
  SidebarChannelAvatar,
  SidebarChannelRow,
  SidebarIconTile,
  SidebarSplitAvatarCluster,
} from "@/components/sidebar/sidebar-channel-icon"
import { Button } from "@/components/ui/button"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import logoSrc from "/branding/full-logo.svg"
import { LANDING_CHANNELS } from "@/lib/landing/landing-channels"
import { LANDING_EMOTES } from "@/lib/landing/landing-emotes"
import { cn } from "@/lib/utils"

type MockChannel = {
  displayName: string
  profileImageUrl: string
  live?: boolean
  unread?: boolean
}

type MockEmote = {
  name: string
  url: string
}

const EMOTES = LANDING_EMOTES

type MockMessagePart =
  | { type: "text"; value: string }
  | { type: "emote"; emote: MockEmote }

type MockMessageTemplate = {
  user: string
  color: string
  parts: MockMessagePart[]
}

type MockMessage = MockMessageTemplate & {
  id: string
  sentAt: number
}

const mockTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function formatMockTimestamp(sentAt: number) {
  return mockTimestampFormatter.format(new Date(sentAt))
}

const SPLIT_CHANNELS: MockChannel[] = [
  LANDING_CHANNELS.rcwOwO,
  LANDING_CHANNELS.dhinkha,
]

const STANDALONE_CHANNELS: MockChannel[] = [
  LANDING_CHANNELS.toastercat,
  LANDING_CHANNELS.xrayc4,
]

const LEFT_SPLIT_POOL: MockMessageTemplate[] = [
  {
    user: "Realviewer67",
    color: "#ff6b9d",
    parts: [
      { type: "text", value: "this guy thinks he's SOOOO funny: " },
      { type: "emote", emote: EMOTES.Jackass },
    ],
  },
  {
    user: "catgoesMEOW",
    color: "#8ab4ff",
    parts: [
      { type: "emote", emote: EMOTES.om },
      { type: "text", value: " bro genuinely who asked" },
    ],
  },
  {
    user: "F0RTNITE_BAWLS",
    color: "#c77dff",
    parts: [
      { type: "emote", emote: EMOTES.widepeepoHappy },
      { type: "text", value: " awww so wholesome" },
    ],
  },
  {
    user: "HappyTacos",
    color: "#f4a261",
    parts: [{ type: "text", value: "im nothing like that depressedtacos guy" }],
  },
  {
    user: "SadTacos",
    color: "#56cfe1",
    parts: [
      { type: "text", value: "i hate that happytacos guy " },
      { type: "emote", emote: EMOTES.Sadge },
    ],
  },
  {
    user: "34_rules",
    color: "#ffd166",
    parts: [
      { type: "emote", emote: EMOTES.KEKW },
      { type: "emote", emote: EMOTES.KEKW },
      { type: "emote", emote: EMOTES.KEKW },
      { type: "emote", emote: EMOTES.KEKW },
      { type: "emote", emote: EMOTES.KEKW },
    ],
  },
  {
    user: "joemama",
    color: "#7fd97f",
    parts: [
      { type: "text", value: "any mods? " },
      { type: "emote", emote: EMOTES.MikuStare },
    ],
  },
  {
    user: "clipdNshipd",
    color: "#e76f51",
    parts: [
      { type: "text", value: "CLIP IT " },
      { type: "emote", emote: EMOTES.KEKW },
    ],
  },
  {
    user: "JustAChill_guy",
    color: "#ff8fab",
    parts: [
      { type: "emote", emote: EMOTES.catJAM },
      { type: "text", value: " yo this beat goes hard ngl" },
    ],
  },
  {
    user: "how_do_i_exist9",
    color: "#a8dadc",
    parts: [
      {
        type: "text",
        value:
          "how do I add a second channel? no like really im really dumb how",
      },
    ],
  },
  {
    user: "MikuDayo01",
    color: "#ffb703",
    parts: [
      { type: "emote", emote: EMOTES.MikuStare },
      { type: "text", value: " I LOVE HATSUNE MIKU!!!!! " },
      { type: "emote", emote: EMOTES.MikuStare },
    ],
  },
]

const RIGHT_SPLIT_POOL: MockMessageTemplate[] = [
  {
    user: "queen_nefer",
    color: "#7fd97f",
    parts: [{ type: "text", value: "NEFER MY QUEENNNN omggggg" }],
  },
  {
    user: "Trackpadgamer0",
    color: "#ffd166",
    parts: [
      { type: "emote", emote: EMOTES.om },
      { type: "text", value: " you use a mouse there aint no way" },
    ],
  },
  {
    user: "pri5ateADVOCATE",
    color: "#56cfe1",
    parts: [
      {
        type: "text",
        value:
          "ok but like imagine if it was completely local and in your browser lol",
      },
    ],
  },
  {
    user: "clipdNshipd",
    color: "#e76f51",
    parts: [
      { type: "text", value: "yep. clipped and shipped here too " },
      { type: "emote", emote: EMOTES.KEKW },
    ],
  },
  {
    user: "Realviewer67",
    color: "#8ab4ff",
    parts: [
      { type: "text", value: "wait i can see both chats now?! " },
      { type: "emote", emote: EMOTES.jakeS },
    ],
  },
  {
    user: "jenshinimpacccc",
    color: "#c77dff",
    parts: [
      { type: "emote", emote: EMOTES.om },
      { type: "text", value: " someone clip that" },
    ],
  },
  {
    user: "lurker1_01",
    color: "#a8dadc",
    parts: [{ type: "text", value: "yea still here" }],
  },
  {
    user: "GiftMe",
    color: "#ff6b9d",
    parts: [
      { type: "text", value: "can i get a gifted sub pls? " },
      { type: "emote", emote: EMOTES.ewphop },
    ],
  },
  {
    user: "holesome_chatter",
    color: "#ffb703",
    parts: [{ type: "emote", emote: EMOTES.widepeepoHappy }],
  },
  {
    user: "uwu2cute",
    color: "#9b8cff",
    parts: [
      { type: "text", value: "bro add another split then ig " },
      { type: "emote", emote: EMOTES.MikuStare },
    ],
  },
]

const MAX_MESSAGES_PER_CHANNEL = 20
const MESSAGE_INTERVAL_MS = 2200
const INITIAL_SEED_COUNT = 10

function seedMessages(
  pool: MockMessageTemplate[],
  prefix: string,
  count: number
): MockMessage[] {
  const end = Date.now()

  return pool.slice(0, count).map((message, index) => ({
    ...message,
    id: `${prefix}-seed-${index}`,
    sentAt: end - (count - 1 - index) * MESSAGE_INTERVAL_MS,
  }))
}

function MockEmoteImg({ emote }: { emote: MockEmote }) {
  return (
    <img
      src={emote.url}
      alt={emote.name}
      title={emote.name}
      className="mx-0.5 inline-block h-[1.35em] w-auto align-[-0.2em]"
      loading="lazy"
      draggable={false}
    />
  )
}

function mockMessagePartKey(
  messageId: string,
  part: MockMessagePart,
  offset: number
): string {
  if (part.type === "emote") {
    return `${messageId}-emote-${offset}-${part.emote.url}`
  }

  return `${messageId}-text-${offset}-${part.value}`
}

function renderMockMessageParts(message: MockMessage) {
  let offset = 0
  const nodes: React.ReactNode[] = []

  for (const part of message.parts) {
    const key = mockMessagePartKey(message.id, part, offset)
    if (part.type === "emote") {
      nodes.push(<MockEmoteImg key={key} emote={part.emote} />)
    } else {
      nodes.push(<span key={key}>{part.value}</span>)
    }

    offset += part.type === "emote" ? part.emote.name.length : part.value.length
  }

  return nodes
}

function MockMessageRow({
  message,
  alternate,
}: {
  message: MockMessage
  alternate: boolean
}) {
  return (
    <div
      className={cn(
        "chat-message chat-message-size animate-in px-2.5 py-0.5 duration-300 fade-in slide-in-from-bottom-1",
        alternate && "chat-message--alternate"
      )}
    >
      <span className="chat-timestamp mr-1.5 text-[0.85em] tabular-nums">
        {formatMockTimestamp(message.sentAt)}
      </span>
      <span className="font-semibold" style={{ color: message.color }}>
        {message.user}
      </span>
      <span className="chat-colon mx-0.5">:</span>
      <span className="chat-message-text">
        {renderMockMessageParts(message)}
      </span>
    </div>
  )
}

function MockChannelAvatar({
  channel,
  className = "size-6 shrink-0 rounded-full object-cover",
  fallbackClassName = "flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase text-white",
}: {
  channel: MockChannel
  className?: string
  fallbackClassName?: string
}) {
  const [imageFailed, setImageFailed] = React.useState(false)
  const showImage = channel.profileImageUrl.length > 0 && !imageFailed

  if (showImage) {
    return (
      <img
        src={channel.profileImageUrl}
        alt=""
        className={className}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <span className={fallbackClassName}>{channel.displayName.slice(0, 2)}</span>
  )
}

const MockChatPane = React.memo(function MockChatPane({
  channel,
  messages,
}: {
  channel: MockChannel
  messages: MockMessage[]
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/60 bg-(--chat-background)">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <MockChannelAvatar channel={channel} />
        <span className="truncate text-sm font-medium">
          {channel.displayName}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="chat-scroll min-h-0 flex-1 overflow-hidden py-1"
      >
        <div className="chat-presentation chat-presentation--alternating-rows">
          {messages.map((message, index) => (
            <MockMessageRow
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
  )
})

function MockSidebarChannelIcon({
  channel,
  isActive,
  showUnread,
}: {
  channel: MockChannel
  isActive: boolean
  showUnread: boolean
}) {
  return (
    <SidebarChannelRow isActive={isActive} showUnread={showUnread}>
      <SidebarIconTile
        isActive={isActive}
        showPing={false}
        showLive={channel.live ?? false}
      >
        <SidebarChannelAvatar
          login={channel.displayName}
          profileImageUrl={channel.profileImageUrl}
        />
      </SidebarIconTile>
    </SidebarChannelRow>
  )
}

function MockSidebarSplit({ channels }: { channels: MockChannel[] }) {
  const showLive = channels.some((channel) => channel.live)

  return (
    <SidebarChannelRow isActive showUnread={false}>
      <SidebarIconTile isActive showPing={false} showLive={showLive}>
        <SidebarSplitAvatarCluster
          channels={channels.map((channel) => ({
            login: channel.displayName,
            profileImageUrl: channel.profileImageUrl,
          }))}
        />
      </SidebarIconTile>
    </SidebarChannelRow>
  )
}

const MockSidebar = React.memo(function MockSidebar() {
  return (
    <aside
      className="flex w-18 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}
    >
      <div className="flex flex-col items-stretch gap-2 px-0 py-3">
        {STANDALONE_CHANNELS.map((channel) => (
          <MockSidebarChannelIcon
            key={channel.displayName}
            channel={channel}
            isActive={false}
            showUnread={channel.unread ?? false}
          />
        ))}
        <MockSidebarSplit channels={SPLIT_CHANNELS} />
      </div>
      <div className="mt-auto flex items-center justify-center p-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          tabIndex={-1}
          aria-hidden
        >
          <PlusIcon className="size-3.5 shrink-0" />
        </Button>
      </div>
    </aside>
  )
})

function useChannelTicker(
  pool: MockMessageTemplate[],
  seedPrefix: string,
  intervalMs: number,
  active: boolean,
  startDelayMs = 0
) {
  const [messages, setMessages] = React.useState<MockMessage[]>(() =>
    seedMessages(pool, seedPrefix, INITIAL_SEED_COUNT)
  )
  const poolIndexRef = React.useRef(INITIAL_SEED_COUNT)

  React.useEffect(() => {
    if (!active) {
      return
    }

    let interval = 0
    const startTimer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        const template = pool[poolIndexRef.current % pool.length]
        poolIndexRef.current += 1

        setMessages((current) => {
          const sentAt = Date.now()
          const next = [
            ...current,
            {
              ...template,
              id: `${seedPrefix}-${poolIndexRef.current}-${sentAt}`,
              sentAt,
            },
          ]
          return next.length > MAX_MESSAGES_PER_CHANNEL
            ? next.slice(-MAX_MESSAGES_PER_CHANNEL)
            : next
        })
      }, intervalMs)
    }, startDelayMs)

    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(interval)
    }
  }, [active, intervalMs, pool, seedPrefix, startDelayMs])

  return messages
}

export function HeroChatMockup() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const tiltFrameRef = React.useRef(0)
  const pendingTiltRef = React.useRef({ x: 0, y: 0 })
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })
  const [visible, setVisible] = React.useState(true)
  const reducedMotion = usePrefersReducedMotion()

  React.useEffect(() => {
    const element = stageRef.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false)
      },
      { rootMargin: "80px" }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const leftSplitMessages = useChannelTicker(
    LEFT_SPLIT_POOL,
    "left-split",
    MESSAGE_INTERVAL_MS,
    visible
  )
  const rightSplitMessages = useChannelTicker(
    RIGHT_SPLIT_POOL,
    "right-split",
    MESSAGE_INTERVAL_MS + 400,
    visible,
    1100
  )

  const scheduleTiltUpdate = React.useCallback(() => {
    if (tiltFrameRef.current !== 0) {
      return
    }

    tiltFrameRef.current = window.requestAnimationFrame(() => {
      tiltFrameRef.current = 0
      setTilt(pendingTiltRef.current)
    })
  }, [])

  React.useEffect(() => {
    return () => {
      if (tiltFrameRef.current !== 0) {
        window.cancelAnimationFrame(tiltFrameRef.current)
      }
    }
  }, [])

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) {
        return
      }

      const stage = stageRef.current
      if (!stage) return

      const rect = stage.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5

      pendingTiltRef.current = {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      }
      scheduleTiltUpdate()
    },
    [reducedMotion, scheduleTiltUpdate]
  )

  const handlePointerLeave = React.useCallback(() => {
    pendingTiltRef.current = { x: 0, y: 0 }
    scheduleTiltUpdate()
  }, [scheduleTiltUpdate])

  const rotateY = -6 + tilt.x * 8
  const rotateX = 3 - tilt.y * 6

  return (
    <div
      ref={stageRef}
      className="landing-mockup-stage"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden
    >
      <div
        className="landing-mockup-depth landing-mockup-depth--far"
        style={{
          transform: `rotateY(${rotateY * 0.5}deg) rotateX(${rotateX * 0.5}deg) translateZ(-64px)`,
        }}
        aria-hidden
      />
      <div
        className="landing-mockup-depth landing-mockup-depth--near"
        style={{
          transform: `rotateY(${rotateY * 0.75}deg) rotateX(${rotateX * 0.75}deg) translateZ(-28px)`,
        }}
        aria-hidden
      />

      <div className="relative z-2 w-full animate-landing-mockup-float transform-3d motion-reduce:animate-none">
        <div
          className="landing-mockup-tilt"
          style={{
            transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translateZ(20px)`,
          }}
        >
          <div className="relative overflow-hidden rounded-lg border border-border bg-background shadow-[0_2px_4px_oklch(0_0_0/25%),0_16px_32px_-8px_oklch(0_0_0/45%),0_32px_64px_-16px_oklch(0_0_0/35%)] transform-3d">
            <header className="relative flex h-12 items-center justify-between border-b border-border bg-sidebar px-4">
              <img src={logoSrc} alt="" className="h-6 w-auto brand-mark" />
              <div className="flex items-center gap-2">
                <span className="size-7 rounded-full bg-primary/20" />
                <span className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground">
                  <BellIcon className="size-3.5" />
                </span>
              </div>
            </header>
            <div className="relative flex h-[min(22rem,46vw)] min-h-60">
              <MockSidebar />
              <div className="flex min-w-0 flex-1 divide-x divide-border/60">
                <MockChatPane
                  channel={SPLIT_CHANNELS[0] as MockChannel}
                  messages={leftSplitMessages}
                />
                <MockChatPane
                  channel={SPLIT_CHANNELS[1] as MockChannel}
                  messages={rightSplitMessages}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
