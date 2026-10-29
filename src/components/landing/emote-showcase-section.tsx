import type * as React from "react"

import { useIntersectionVisible } from "@/hooks/use-intersection-visible"
import {
  LANDING_EMOTES,
  LANDING_EMOTE_PROVIDERS,
  type LandingEmoteKey,
} from "@/lib/landing/landing-emotes"

type FlyingEmote = {
  key: LandingEmoteKey
  top: number
  height: number
  duration: number
  phase: number
  blur: number
  opacity: number
  rotate: number
}

const FLYING_EMOTES: FlyingEmote[] = [
  {
    key: "KEKW",
    top: 8,
    height: 4.5,
    duration: 26,
    phase: 0.05,
    blur: 3,
    opacity: 0.5,
    rotate: -10,
  },
  {
    key: "buh",
    top: 62,
    height: 5.5,
    duration: 22,
    phase: 0.18,
    blur: 2.5,
    opacity: 0.55,
    rotate: 8,
  },
  {
    key: "om",
    top: 32,
    height: 3,
    duration: 38,
    phase: 0.31,
    blur: 5,
    opacity: 0.3,
    rotate: 6,
  },
  {
    key: "catJAM",
    top: 78,
    height: 3.5,
    duration: 34,
    phase: 0.44,
    blur: 4.5,
    opacity: 0.35,
    rotate: -6,
  },
  {
    key: "MikuStare",
    top: 14,
    height: 3.25,
    duration: 36,
    phase: 0.58,
    blur: 5,
    opacity: 0.3,
    rotate: 12,
  },
  {
    key: "jakeS",
    top: 46,
    height: 5,
    duration: 24,
    phase: 0.72,
    blur: 3,
    opacity: 0.5,
    rotate: -8,
  },
  {
    key: "Sadge",
    top: 70,
    height: 4.5,
    duration: 27,
    phase: 0.86,
    blur: 3,
    opacity: 0.45,
    rotate: 10,
  },
  {
    key: "ewphop",
    top: 4,
    height: 3.5,
    duration: 33,
    phase: 0.97,
    blur: 4.5,
    opacity: 0.35,
    rotate: -12,
  },
  {
    key: "widepeepoHappy",
    top: 40,
    height: 3.25,
    duration: 40,
    phase: 0.63,
    blur: 5.5,
    opacity: 0.28,
    rotate: 3,
  },
  {
    key: "Jackass",
    top: 22,
    height: 5.25,
    duration: 23,
    phase: 0.38,
    blur: 2.5,
    opacity: 0.5,
    rotate: 7,
  },
  {
    key: "KEKW",
    top: 84,
    height: 3,
    duration: 39,
    phase: 0.12,
    blur: 5.5,
    opacity: 0.28,
    rotate: 9,
  },
  {
    key: "buh",
    top: 52,
    height: 3,
    duration: 37,
    phase: 0.92,
    blur: 5,
    opacity: 0.3,
    rotate: -5,
  },
]

function FlyingEmoteLane({ emote }: { emote: FlyingEmote }) {
  const data = LANDING_EMOTES[emote.key]

  return (
    <div
      className="landing-emote-flyer pointer-events-none absolute inset-x-0"
      style={
        {
          top: `${emote.top}%`,
          "--flyer-duration": `${emote.duration}s`,
          "--flyer-delay": `${-emote.duration * emote.phase}s`,
          "--flyer-rest": `${-(10 + emote.phase * 80)}%`,
        } as React.CSSProperties
      }
    >
      <img
        src={data.url}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute left-full w-auto max-w-none object-contain"
        style={{
          height: `min(${emote.height}rem, ${emote.height * 3.2}vw)`,
          opacity: emote.opacity,
          filter: `blur(${emote.blur}px)`,
          rotate: `${emote.rotate}deg`,
        }}
      />
    </div>
  )
}

function ProviderLogos() {
  return (
    <ul className="flex items-end gap-6 sm:gap-8">
      {LANDING_EMOTE_PROVIDERS.map((provider) => (
        <li
          key={provider.id}
          className="flex flex-col items-center gap-2"
          title={provider.name}
        >
          <span
            className="block size-8 bg-white"
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
  )
}

export function EmoteShowcaseSection() {
  const { ref, visible } = useIntersectionVisible<HTMLElement>({
    rootMargin: "120px",
  })

  return (
    <section
      ref={ref}
      id="emotes"
      data-paused={!visible}
      className="landing-emote-flyers relative overflow-hidden border-t border-white/8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%),radial-gradient(ellipse_30%_60%_at_10%_50%,color-mix(in_oklch,#e91916_5%,transparent),transparent_62%),radial-gradient(ellipse_30%_60%_at_90%_50%,color-mix(in_oklch,#00b5ad_6%,transparent),transparent_60%)]"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {FLYING_EMOTES.map((emote) => (
          <FlyingEmoteLane key={`${emote.key}-${emote.top}`} emote={emote} />
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 md:flex-row md:items-center md:justify-between lg:py-16">
        <div className="relative max-w-md">
          <div
            className="pointer-events-none absolute -inset-x-12 -inset-y-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--background)_85%,transparent)_0%,color-mix(in_oklch,var(--background)_50%,transparent)_40%,transparent_72%)]"
            aria-hidden
          />
          <div className="relative">
            <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Support for
              <br />
              <span className="text-primary">ALL of the emotes.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Native Twitch emotes alongside BetterTTV, FrankerFaceZ, and 7TV,
              with 7TV sets updating live.
            </p>
          </div>
        </div>

        <div className="relative flex flex-col items-start gap-4 md:items-end">
          <div
            className="pointer-events-none absolute -inset-x-12 -inset-y-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--background)_85%,transparent)_0%,color-mix(in_oklch,var(--background)_50%,transparent)_40%,transparent_72%)]"
            aria-hidden
          />
          <div className="relative">
            <ProviderLogos />
          </div>
          <p className="relative text-[0.7rem] leading-relaxed text-white/60">
            Peepochat has no association with any of the services shown.
          </p>
        </div>
      </div>
    </section>
  )
}
