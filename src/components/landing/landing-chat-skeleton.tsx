import * as React from "react"

import { cn } from "@/lib/utils"

type SkeletonLine = {
  nameWidth: number
  nameHue: number
  firstWidth: number
  secondWidth: number | null
  emote: boolean
}

const LINE_COUNT = 32
const NAME_HUES = [25, 75, 145, 200, 265, 320] as const

function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLines(seed: number): SkeletonLine[] {
  const random = createRandom(seed)

  return Array.from({ length: LINE_COUNT }, () => {
    const wraps = random() < 0.28
    return {
      nameWidth: 2.25 + random() * 1.75,
      nameHue: NAME_HUES[Math.floor(random() * NAME_HUES.length)]!,
      firstWidth: wraps ? 1 : 0.3 + random() * 0.65,
      secondWidth: wraps ? 0.25 + random() * 0.6 : null,
      emote: random() < 0.22,
    }
  })
}

export function LandingChatSkeleton({
  seed = 1,
  className,
}: {
  seed?: number
  className?: string
}) {
  const lines = React.useMemo(() => buildLines(seed), [seed])

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-end gap-1.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_2rem)] px-2.5 py-2",
        className
      )}
      aria-hidden
    >
      {lines.map((line, index) => (
        <div key={index} className="flex shrink-0 items-start gap-1.5">
          <div className="flex h-3.5 shrink-0 items-center">
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${line.nameWidth}rem`,
                background: `oklch(0.72 0.13 ${line.nameHue} / 55%)`,
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex h-3.5 min-w-0 items-center gap-1">
              <div
                className="h-2.5 min-w-0 rounded-full bg-foreground/12"
                style={{ width: `${line.firstWidth * 100}%` }}
              />
              {line.emote ? (
                <div className="size-3.5 shrink-0 rounded-[3px] bg-foreground/20" />
              ) : null}
            </div>
            {line.secondWidth !== null ? (
              <div
                className="h-2.5 rounded-full bg-foreground/12"
                style={{ width: `${line.secondWidth * 100}%` }}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
