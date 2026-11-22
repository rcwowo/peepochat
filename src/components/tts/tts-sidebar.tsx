import * as React from "react"
import {
  AudioLinesIcon,
  ListOrderedIcon,
  PanelRightCloseIcon,
  PowerIcon,
  XIcon,
} from "lucide-react"

import { TtsPlaybackControls } from "@/components/tts/tts-playback-controls"
import { useIsMobile } from "@/hooks/use-mobile"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  fetchUserAvatarUrl,
  getCachedUserAvatarUrl,
  subscribeToUserAvatars,
} from "@/lib/twitch/channel/user-avatars"
import {
  useTtsPlayback,
  useTtsSession,
  type TtsQueueItem,
} from "@/lib/tts/tts-context"
import {
  TTS_SIDEBAR_MAX_WIDTH,
  TTS_SIDEBAR_MIN_WIDTH,
} from "@/lib/tts/tts-ui-prefs"
import { cn } from "@/lib/utils"

const SIDEBAR_CLOSE_FALLBACK_MS = 400

function focusIfFocusLost(node: HTMLElement | null) {
  if (
    node &&
    (!document.activeElement || document.activeElement === document.body)
  ) {
    node.focus({ preventScroll: true })
  }
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarResizeHandle({
  width,
  onResize,
}: {
  width: number
  onResize: (width: number) => void
}) {
  const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(
    null
  )
  const [dragging, setDragging] = React.useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Chatvoice queue"
      aria-valuemin={TTS_SIDEBAR_MIN_WIDTH}
      aria-valuemax={TTS_SIDEBAR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          onResize(width + 16)
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          onResize(width - 16)
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { startX: event.clientX, startWidth: width }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) {
          return
        }
        onResize(drag.startWidth + (drag.startX - event.clientX))
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        dragRef.current = null
        setDragging(false)
      }}
      onPointerCancel={() => {
        dragRef.current = null
        setDragging(false)
      }}
      className={cn(
        "group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none outline-none md:block",
        dragging && "select-none"
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60",
          dragging && "bg-primary/60"
        )}
      />
    </div>
  )
}

function ChannelAvatar({
  login,
  name,
  profileImageUrl,
}: {
  login: string
  name: string
  profileImageUrl?: string
}) {
  const { account } = usePeepochatSettings()
  const getSnapshot = React.useCallback(
    () => getCachedUserAvatarUrl(login) ?? null,
    [login]
  )
  const cachedImageUrl = React.useSyncExternalStore(
    subscribeToUserAvatars,
    getSnapshot,
    getSnapshot
  )
  const imageUrl = profileImageUrl || cachedImageUrl

  React.useEffect(() => {
    if (profileImageUrl || !account) {
      return
    }
    void fetchUserAvatarUrl(login, account.accessToken, account.clientId)
  }, [account, login, profileImageUrl])

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        title={`#${name}`}
        draggable={false}
        className="size-6 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      title={`#${name}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary uppercase"
    >
      {login.slice(0, 2)}
    </span>
  )
}

function QueueItemCard({
  item,
  active,
  playing,
  onRemove,
}: {
  item: TtsQueueItem
  active: boolean
  playing: boolean
  onRemove: () => void
}) {
  return (
    <li
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative min-w-0 rounded-lg border px-3 py-2 transition-colors",
        active
          ? "border-primary/60 bg-primary/10 dark:bg-primary/15"
          : "border-border bg-background/60"
      )}
    >
      <div className="flex min-w-0 items-center gap-2 pr-6">
        {active ? (
          <AudioLinesIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-primary",
              playing && "motion-safe:animate-pulse"
            )}
          />
        ) : null}
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={item.displayName}
        >
          {item.displayName}
        </span>
        <span
          className="max-w-28 shrink-0 truncate rounded-md border border-border px-1.5 py-px text-[10px] leading-tight text-muted-foreground"
          title={item.voiceLabel}
        >
          {item.voiceLabel}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug wrap-break-word text-muted-foreground">
        {item.text}
      </p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove message from ${item.displayName}`}
        className="absolute top-1.5 right-1.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity outline-none group-hover:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/35 max-md:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  )
}

function QueueToggle() {
  const { queueEnabled, setQueueEnabled } = useTtsPlayback()

  return (
    <div
      role="group"
      aria-label="Add new messages to the queue"
      className="inline-flex items-center rounded-full border border-border bg-background p-0.5"
    >
      {[true, false].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={queueEnabled === value}
          onClick={() => setQueueEnabled(value)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            queueEnabled === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value ? "On" : "Off"}
        </button>
      ))}
    </div>
  )
}

export function TtsSidebar() {
  const { channelLogin, stopTts, ui, setCollapsed, setSidebarWidth } =
    useTtsSession()
  const { queue, activeItemId, playing, queueEnabled, removeItem } =
    useTtsPlayback()
  const { config } = usePeepochatSettings()
  const isMobile = useIsMobile()
  const reducedMotion = usePrefersReducedMotion()
  const open = Boolean(channelLogin) && !ui.collapsed
  const [wasOpen, setWasOpen] = React.useState(open)
  const [closing, setClosing] = React.useState(false)

  if (open !== wasOpen) {
    setWasOpen(open)
    setClosing(!open && isMobile && !reducedMotion)
  }

  React.useEffect(() => {
    if (!closing) {
      return
    }
    const timeout = window.setTimeout(
      () => setClosing(false),
      SIDEBAR_CLOSE_FALLBACK_MS
    )
    return () => window.clearTimeout(timeout)
  }, [closing])

  if (!channelLogin || (!open && !closing)) {
    return null
  }

  const channel = config.twitch.channels.find(
    (entry) => entry.login === channelLogin
  )
  const channelName = channel?.displayName?.trim() || channelLogin
  const emptyDescription = !queueEnabled
    ? "Queueing is off, so new messages won't be added."
    : playing
      ? "New chat messages will show up here as they're queued."
      : "Speech is paused. Press play to resume."

  return (
    <aside
      ref={focusIfFocusLost}
      tabIndex={-1}
      aria-label="Chatvoice queue"
      data-state={open ? "open" : "closed"}
      aria-hidden={open ? undefined : true}
      inert={!open}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !open) {
          setClosing(false)
        }
      }}
      style={{ "--tts-width": `${ui.width}px` } as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault()
          setCollapsed(true)
        }
      }}
      className="relative z-40 flex h-svh shrink-0 flex-col border-l border-sidebar-border bg-sidebar outline-none motion-reduce:animate-none max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:w-full max-md:shadow-2xl max-md:ease-out max-md:animation-duration-200 max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:slide-out-to-right max-md:data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-right max-sm:border-l-0 sm:max-md:max-w-md md:w-(--tts-width)"
    >
      <SidebarResizeHandle width={ui.width} onResize={setSidebarWidth} />

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <ChannelAvatar
          login={channelLogin}
          name={channelName}
          profileImageUrl={channel?.profileImageUrl}
        />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          Chatvoice
        </div>
        <HeaderButton label="Stop Chatvoice" onClick={stopTts}>
          <PowerIcon className="size-4" />
        </HeaderButton>
        <HeaderButton label="Collapse queue" onClick={() => setCollapsed(true)}>
          <PanelRightCloseIcon className="size-4" />
        </HeaderButton>
      </header>

      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3 pb-2">
        <h2 className="text-xs font-medium text-muted-foreground">
          Queue <span className="tabular-nums">({queue.length})</span>
        </h2>
        <QueueToggle />
      </div>

      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="rounded-full border border-border bg-muted/40 p-3">
            <ListOrderedIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium">Queue is empty</div>
          <p className="max-w-56 text-xs text-muted-foreground">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-3">
          {queue.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              playing={playing}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </ol>
      )}

      <div className="shrink-0 border-t border-border px-3 py-3">
        <TtsPlaybackControls />
      </div>
    </aside>
  )
}
