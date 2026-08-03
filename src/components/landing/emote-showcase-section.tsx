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

const SPLASH_SPREAD_FILL = 0.96

const MAX_SPLASH_AXIS = Math.max(
  ...SPLASH_EMOTES.flatMap((layout) => [Math.abs(layout.x), Math.abs(layout.y)])
)

function getEmoteSizeScale(stageWidth: number) {
  if (stageWidth < 400) return 0.58
  if (stageWidth < 560) return 0.7
  if (stageWidth < 768) return 0.84
  return 1
}

function getCenterKeepout(stageWidth: number, rootFontSize: number) {
  if (stageWidth < 400) {
    return {
      halfWidth: 7.25 * rootFontSize,
      halfHeight: 6.5 * rootFontSize,
    }
  }
  if (stageWidth < 640) {
    return {
      halfWidth: 8.5 * rootFontSize,
      halfHeight: 7.25 * rootFontSize,
    }
  }
  return {
    halfWidth: 10.5 * rootFontSize,
    halfHeight: 8.5 * rootFontSize,
  }
}

function getMaxEmoteHalfSizes(rootFontSize: number, sizeScale: number) {
  let halfWidth = 0
  let halfHeight = 0

  for (const layout of SPLASH_EMOTES) {
    halfWidth = Math.max(
      halfWidth,
      ((layout.widthRem ?? layout.heightRem) *
        rootFontSize *
        layout.scale *
        sizeScale) /
        2
    )
    halfHeight = Math.max(
      halfHeight,
      (layout.heightRem * rootFontSize * layout.scale * sizeScale) / 2
    )
  }

  return { halfWidth, halfHeight }
}

function getSplashSpread(stageRect: DOMRect, rootFontSize: number) {
  const sizeScale = getEmoteSizeScale(stageRect.width)
  const { halfWidth, halfHeight } = getMaxEmoteHalfSizes(
    rootFontSize,
    sizeScale
  )
  const keepout = getCenterKeepout(stageRect.width, rootFontSize)
  const edgePadding = stageRect.width < 560 ? 8 : 12

  const maxTravelX = Math.max(0, stageRect.width / 2 - halfWidth - edgePadding)
  const maxTravelY = Math.max(
    0,
    stageRect.height / 2 - halfHeight - edgePadding
  )

  const spreadX = Math.min(
    maxTravelX,
    Math.max(
      keepout.halfWidth + halfWidth * 0.2,
      maxTravelX * SPLASH_SPREAD_FILL
    )
  )
  const spreadY = Math.min(
    maxTravelY,
    Math.max(
      keepout.halfHeight + halfHeight * 0.2,
      maxTravelY * SPLASH_SPREAD_FILL
    )
  )

  return { spreadX, spreadY, sizeScale }
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
  spreadY: number,
  sizeScale: number
) {
  stage.style.setProperty("--splash-motion", String(motion))
  stage.style.setProperty("--spread-x", `${spreadX}px`)
  stage.style.setProperty("--spread-y", `${spreadY}px`)
  stage.style.setProperty("--emote-size-scale", String(sizeScale))
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
      const { spreadX, spreadY, sizeScale } = getSplashSpread(
        rect,
        rootFontSize
      )

      if (reducedMotion) {
        const inView = rect.top < viewportHeight && rect.bottom > 0
        applySplashMotionVars(
          stage,
          inView ? 1 : 0,
          spreadX,
          spreadY,
          sizeScale
        )
        return
      }

      applySplashMotionVars(
        stage,
        getViewportSplashMotion(rect, viewportHeight),
        spreadX,
        spreadY,
        sizeScale
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_65%_at_50%_50%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%),radial-gradient(ellipse_40%_50%_at_12%_42%,color-mix(in_oklch,#e91916_5%,transparent),transparent_62%),radial-gradient(ellipse_38%_48%_at_88%_38%,color-mix(in_oklch,#00b5ad_6%,transparent),transparent_60%),radial-gradient(ellipse_36%_44%_at_52%_88%,color-mix(in_oklch,#9b59b6_4%,transparent),transparent_58%)]"
        aria-hidden
      />

      <div
        ref={stageRef}
        className="landing-emote-splash-stage relative mx-auto flex min-h-[min(44rem,94svh)] w-full max-w-304 items-center justify-center px-[clamp(1rem,4vw,2rem)] py-[clamp(3rem,8vh,5rem)] max-sm:min-h-[min(36rem,90svh)]"
      >
        {SPLASH_EMOTES.map((layout) => (
          <SplashEmote key={layout.key} layout={layout} />
        ))}

        <div className="relative z-3 mx-auto max-w-120 px-[clamp(1.25rem,5vw,2.75rem)] py-[clamp(1.5rem,4.5vw,2.5rem)] text-center">
          <div
            className="pointer-events-none absolute top-[46%] left-1/2 aspect-square w-[min(52rem,220%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,oklch(0.12_0.02_320/88%)_0%,oklch(0.12_0.02_320/55%)_28%,oklch(0.12_0.02_320/22%)_48%,transparent_68%)]"
            aria-hidden
          />

          <div className="relative">
            <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Support for
              <br />
              <span className="text-primary">ALL of the emotes.</span>
            </h2>

            <ul className="mt-[1.35rem] flex items-end justify-center gap-[clamp(1rem,4vw,2rem)] max-[480px]:gap-3">
              {LANDING_EMOTE_PROVIDERS.map((provider) => (
                <li
                  key={provider.id}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2.5 p-0"
                >
                  <span
                    className="block size-10 bg-white max-[480px]:size-8"
                    style={{
                      maskImage: `url(${provider.iconSrc})`,
                      maskSize: "contain",
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskImage: `url(${provider.iconSrc})`,
                      WebkitMaskSize: "contain",
                      WebkitMaskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                    }}
                    aria-hidden
                  />
                  <span className="text-[0.65rem] font-semibold tracking-widest text-white/80 uppercase">
                    {provider.shortName}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[0.7rem] leading-relaxed text-white/70">
              Peepochat has no association with any of the services shown above.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
