import * as React from "react"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import {
  LANDING_EMOTES,
  LANDING_EMOTE_PROVIDERS,
  type LandingEmote,
  type LandingEmoteKey,
} from "@/lib/landing/landing-emotes"
import { clamp, cn } from "@/lib/utils"

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
  ...SPLASH_EMOTES.flatMap((layout) => [Math.abs(layout.x), Math.abs(layout.y)])
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

function getSplashSpread(stageRect: DOMRect, rootFontSize: number) {
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

function getViewportSplashMotion(stageRect: DOMRect, viewportHeight: number) {
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

function applySplashMotionVars(
  stage: HTMLElement,
  motion: number,
  spreadX: number,
  spreadY: number
) {
  stage.style.setProperty("--splash-motion", String(motion))
  stage.style.setProperty("--spread-x", `${spreadX}px`)
  stage.style.setProperty("--spread-y", `${spreadY}px`)
}

function useScrollSplashMotion(
  stageRef: React.RefObject<HTMLElement | null>,
  reducedMotion: boolean
) {
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    let rootFontSize =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16
    let frame = 0

    const update = () => {
      frame = 0
      const rect = stage.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const { spreadX, spreadY } = getSplashSpread(rect, rootFontSize)

      if (reducedMotion) {
        const inView = rect.top < viewportHeight && rect.bottom > 0
        applySplashMotionVars(stage, inView ? 1 : 0, spreadX, spreadY)
        return
      }

      applySplashMotionVars(
        stage,
        getViewportSplashMotion(rect, viewportHeight),
        spreadX,
        spreadY
      )
    }

    const scheduleUpdate = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(update)
    }

    const handleResize = () => {
      rootFontSize =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize
        ) || 16
      scheduleUpdate()
    }

    update()
    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", handleResize, { passive: true })

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", handleResize)
    }
  }, [reducedMotion, stageRef])
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
        isWide && "flex items-center justify-center"
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
  const reducedMotion = usePrefersReducedMotion()
  useScrollSplashMotion(stageRef, reducedMotion)

  return (
    <section
      id="emotes"
      className="relative overflow-hidden border-y border-[color-mix(in_oklch,var(--border)_60%,transparent)]"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_65%_at_50%_50%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_68%),radial-gradient(ellipse_40%_50%_at_12%_42%,color-mix(in_oklch,#e91916_10%,transparent),transparent_60%),radial-gradient(ellipse_38%_48%_at_88%_38%,color-mix(in_oklch,#00b5ad_12%,transparent),transparent_58%),radial-gradient(ellipse_36%_44%_at_52%_88%,color-mix(in_oklch,#9b59b6_9%,transparent),transparent_55%)]"
        aria-hidden
      />

      <div
        ref={stageRef}
        className="landing-emote-splash-stage relative mx-auto flex min-h-[min(44rem,94svh)] w-full max-w-304 items-center justify-center px-[clamp(1rem,4vw,2rem)] py-[clamp(3rem,8vh,5rem)] max-sm:min-h-[min(36rem,90svh)]"
      >
        {SPLASH_EMOTES.map((layout) => (
          <SplashEmote key={layout.key} layout={layout} />
        ))}

        <div className="relative z-3 mx-auto max-w-120 transform-[scale(calc(0.94+var(--splash-motion)*0.06))] px-[clamp(1.75rem,5vw,2.75rem)] py-[clamp(1.75rem,4.5vw,2.5rem)] text-center motion-reduce:transform-none">
          <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance text-shadow-[0_2px_14px_oklch(0_0_0/92%),0_0_36px_oklch(0_0_0/72%)] sm:text-4xl">
            Support for
            <br />
            <span className="text-primary">ALL of the emotes.</span>
          </h2>

          <ul className="mt-[1.35rem] flex items-end justify-center gap-[clamp(1.25rem,4vw,2rem)] max-[480px]:gap-4">
            {LANDING_EMOTE_PROVIDERS.map((provider) => (
              <li
                key={provider.id}
                className="flex min-w-0 flex-1 flex-col items-center gap-2.5 p-0"
              >
                <span className="flex items-center justify-center">
                  <img
                    src={provider.iconSrc}
                    alt=""
                    className="h-10 w-auto opacity-94 filter-[brightness(0)_invert(1)_drop-shadow(0_2px_10px_oklch(0_0_0/90%))_drop-shadow(0_0_22px_oklch(0_0_0/65%))] max-[480px]:h-8"
                  />
                </span>
                <span className="text-[0.65rem] font-semibold tracking-widest text-[color-mix(in_oklch,white_62%,transparent)] uppercase text-shadow-[0_1px_10px_oklch(0_0_0/88%),0_0_20px_oklch(0_0_0/60%)]">
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
