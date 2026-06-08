import * as React from "react"

import {
  LANDING_EMOTES,
  LANDING_EMOTE_PROVIDERS,
  type LandingEmote,
  type LandingEmoteKey,
} from "@/lib/landing/landing-emotes"
import { cn } from "@/lib/utils"

type SplashEmoteLayout = {
  key: LandingEmoteKey
  x: number
  y: number
  scale: number
  rotate: number
  heightRem: number
  widthRem?: number
  floatDuration: number
  floatAmplitude: number
}

const SPLASH_EMOTES: SplashEmoteLayout[] = [
  {
    key: "KEKW",
    x: -30,
    y: -28,
    scale: 1.1,
    rotate: -14,
    heightRem: 5,
    floatDuration: 4.6,
    floatAmplitude: 7,
  },
  {
    key: "buh",
    x: 34,
    y: -30,
    scale: 1,
    rotate: 11,
    heightRem: 4.6,
    floatDuration: 4.1,
    floatAmplitude: 6,
  },
  {
    key: "om",
    x: 38,
    y: -8,
    scale: 0.95,
    rotate: 7,
    heightRem: 4.4,
    floatDuration: 3.7,
    floatAmplitude: 5,
  },
  {
    key: "jakeS",
    x: 36,
    y: 20,
    scale: 1.05,
    rotate: -9,
    heightRem: 4.8,
    floatDuration: 4.4,
    floatAmplitude: 6,
  },
  {
    key: "widepeepoHappy",
    x: 14,
    y: 36,
    scale: 1,
    rotate: 4,
    heightRem: 3.6,
    widthRem: 9.5,
    floatDuration: 5.1,
    floatAmplitude: 8,
  },
  {
    key: "ewphop",
    x: -6,
    y: 38,
    scale: 1,
    rotate: -7,
    heightRem: 4.5,
    floatDuration: 3.9,
    floatAmplitude: 6,
  },
  {
    key: "MikuStare",
    x: -26,
    y: 32,
    scale: 1,
    rotate: 13,
    heightRem: 4.8,
    floatDuration: 4.3,
    floatAmplitude: 7,
  },
  {
    key: "catJAM",
    x: -38,
    y: 12,
    scale: 1.05,
    rotate: -11,
    heightRem: 4.9,
    floatDuration: 4.8,
    floatAmplitude: 6,
  },
  {
    key: "Sadge",
    x: -36,
    y: -6,
    scale: 0.92,
    rotate: 9,
    heightRem: 4.2,
    floatDuration: 3.6,
    floatAmplitude: 5,
  },
  {
    key: "Jackass",
    x: -18,
    y: -36,
    scale: 1,
    rotate: -6,
    heightRem: 4.6,
    floatDuration: 4.2,
    floatAmplitude: 6,
  },
]

function LandingEmoteImg({
  emote,
  wide,
}: {
  emote: LandingEmote
  wide?: boolean
}) {
  return (
    <img
      src={emote.url}
      alt={emote.name}
      title={emote.name}
      className={cn(
        "max-h-full max-w-full object-contain drop-shadow-lg",
        wide ? "h-full w-full" : "size-full"
      )}
      loading="lazy"
      draggable={false}
    />
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Fast out of the gate, then decelerates smoothly toward a plateau.
const SPRING_RATE = 4.8
const SPRING_PLATEAU = 1 - Math.exp(-SPRING_RATE)

function springMotion(linear: number) {
  if (linear <= 0) return 0
  if (linear >= 1) return 1
  return (1 - Math.exp(-SPRING_RATE * linear)) / SPRING_PLATEAU
}

const SPLASH_SPREAD_FILL = 0.94

const MAX_SPLASH_AXIS = Math.max(
  ...SPLASH_EMOTES.flatMap((layout) => [
    Math.abs(layout.x),
    Math.abs(layout.y),
  ])
)

function getMaxEmoteHalfSizes(rootFontSize: number) {
  let halfWidth = 0
  let halfHeight = 0

  for (const layout of SPLASH_EMOTES) {
    halfWidth = Math.max(
      halfWidth,
      ((layout.widthRem ?? layout.heightRem) * rootFontSize * layout.scale) / 2
    )
    halfHeight = Math.max(
      halfHeight,
      (layout.heightRem * rootFontSize * layout.scale) / 2
    )
  }

  return { halfWidth, halfHeight }
}

function getSplashSpread(stageRect: DOMRect) {
  const rootFontSize =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const { halfWidth, halfHeight } = getMaxEmoteHalfSizes(rootFontSize)
  const edgePadding = 12

  const spreadX = Math.max(
    0,
    (stageRect.width / 2 - halfWidth - edgePadding) * SPLASH_SPREAD_FILL
  )
  const spreadY = Math.max(
    0,
    (stageRect.height / 2 - halfHeight - edgePadding) * SPLASH_SPREAD_FILL
  )

  return { spreadX, spreadY }
}

function getViewportSplashMotion(
  stageRect: DOMRect,
  viewportHeight: number
) {
  const stageTop = stageRect.top
  const stageHeight = stageRect.height

  const motionStart = viewportHeight
  const motionEnd = -stageHeight * 0.55
  const travel = motionStart - motionEnd

  const linear =
    travel <= 0
      ? stageTop <= motionEnd
        ? 1
        : 0
      : clamp((motionStart - stageTop) / travel, 0, 1)

  return springMotion(linear)
}

type SplashScrollState = {
  motion: number
  spreadX: number
  spreadY: number
}

const INITIAL_SPLASH_SCROLL_STATE: SplashScrollState = {
  motion: 0,
  spreadX: 0,
  spreadY: 0,
}

function useScrollSplashMotion(
  stageRef: React.RefObject<HTMLElement | null>
) {
  const [state, setState] = React.useState<SplashScrollState>(
    INITIAL_SPLASH_SCROLL_STATE
  )

  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0

    const update = () => {
      frame = 0
      const rect = stage.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const { spreadX, spreadY } = getSplashSpread(rect)

      if (motionQuery.matches) {
        const inView = rect.top < viewportHeight && rect.bottom > 0
        setState({
          motion: inView ? 1 : 0,
          spreadX,
          spreadY,
        })
        return
      }

      setState({
        motion: getViewportSplashMotion(rect, viewportHeight),
        spreadX,
        spreadY,
      })
    }

    const scheduleUpdate = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate, { passive: true })

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
    }
  }, [stageRef])

  return state
}

function SplashEmote({ layout }: { layout: SplashEmoteLayout }) {
  const emote = LANDING_EMOTES[layout.key]
  const provider = LANDING_EMOTE_PROVIDERS.find(
    (entry) => entry.id === emote.provider
  )
  const isWide = layout.widthRem !== undefined

  return (
    <div
      className={cn(
        "landing-emote-splash-item",
        isWide && "landing-emote-splash-item--wide"
      )}
      style={
        {
          "--burst-nx": layout.x / MAX_SPLASH_AXIS,
          "--burst-ny": layout.y / MAX_SPLASH_AXIS,
          "--burst-scale": layout.scale,
          "--burst-rotate": `${layout.rotate}deg`,
          "--emote-height": `${layout.heightRem}rem`,
          "--emote-width": `${layout.widthRem ?? layout.heightRem}rem`,
          "--float-duration": `${layout.floatDuration}s`,
          "--float-amplitude": `${layout.floatAmplitude}px`,
          "--provider-accent": provider?.accent ?? "var(--primary)",
        } as React.CSSProperties
      }
    >
      <div className="landing-emote-splash-float">
        <div className="landing-emote-splash-glow" aria-hidden />
        <LandingEmoteImg emote={emote} wide={isWide} />
      </div>
    </div>
  )
}

export function EmoteShowcaseSection() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const { motion, spreadX, spreadY } = useScrollSplashMotion(stageRef)

  return (
    <section id="emotes" className="landing-emotes">
      <div className="landing-emotes-ambient" aria-hidden />

      <div
        ref={stageRef}
        className="landing-emote-splash-stage"
        style={
          {
            "--splash-motion": motion,
            "--spread-x": `${spreadX}px`,
            "--spread-y": `${spreadY}px`,
          } as React.CSSProperties
        }
      >
        {SPLASH_EMOTES.map((layout) => (
          <SplashEmote key={layout.key} layout={layout} />
        ))}

        <div className="landing-emote-splash-core">
          <h2 className="landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Support for
            <br />
            <span className="text-primary">ALL of the emotes.</span>
          </h2>

          <ul className="landing-emote-provider-row">
            {LANDING_EMOTE_PROVIDERS.map((provider) => (
              <li key={provider.id} className="landing-emote-provider-chip">
                <span className="landing-emote-provider-chip-icon">
                  <img src={provider.iconSrc} alt="" />
                </span>
                <span className="landing-emote-provider-chip-name">
                  {provider.shortName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
