import type { ReactNode } from "react"
import { ExternalLinkIcon } from "lucide-react"

import { SectionHeading } from "@/components/settings/settings-primitives"
import { RCW_URL } from "@/lib/landing/landing-footer-links"
import { cn } from "@/lib/utils"

const version: string = __APP_VERSION__
const iconBkgSrc = "/icon-bkg.png"
const owoLogoSrc = "/logo-transparent.png"
const BLUESKY_URL = "https://bsky.app/profile/rcw.lol"
const PATREON_URL = "https://www.patreon.com/rcwowo"
const OWO_SUPPORTER_BADGE_IMAGE = "https://i.rcw.lol/u/VrPTF3.png"

type CreditEntry = {
  name: string
  description: string
  href: string
}

const SERVICE_CREDITS: CreditEntry[] = [
  {
    name: "Twitch",
    description: "The very platform you're chatting on.",
    href: "https://www.twitch.tv",
  },
  {
    name: "BetterTTV",
    description: "Emote provider.",
    href: "https://betterttv.com",
  },
  {
    name: "FrankerFaceZ",
    description: "Emote provider.",
    href: "https://www.frankerfacez.com",
  },
  {
    name: "7TV",
    description: "Emote provider.",
    href: "https://7tv.app",
  },
  {
    name: "recent-messages",
    description: "Provides chat history when you join a channel.",
    href: "https://recent-messages.robotty.de/",
  },
  {
    name: "api.ivr.fi",
    description: "Provides some extra info in user cards.",
    href: "https://api.ivr.fi/v2/docs",
  },
]

function CreditsList({ credits }: { credits: CreditEntry[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
      {credits.map((credit) => (
        <li key={credit.name}>
          <a
            href={credit.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-3 px-2.5 py-2.5 transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <div className="min-w-0">
              <div className="text-sm leading-tight font-medium group-hover:text-foreground">
                {credit.name}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {credit.description}
              </p>
            </div>
            <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function DeveloperLink({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-[#ed5ea6] transition-colors hover:text-[#ed5ea6]/80",
        className
      )}
    >
      {children}
      <ExternalLinkIcon className="size-3 opacity-70" />
    </a>
  )
}

function DevelopedBySection() {
  return (
    <div className="space-y-2.5">
      <div className="overflow-hidden rounded-lg border border-border bg-linear-to-br from-muted/35 via-background to-background">
        <div className="flex items-start gap-3 p-3.5">
          <div className="relative mt-0.5 shrink-0">
            <div
              aria-hidden
              className="absolute inset-0 scale-110 rounded-full bg-[#ed5ea6]/15 blur-md"
            />
            <img
              src={owoLogoSrc}
              alt=""
              width={32}
              height={20}
              className="relative h-5 w-auto opacity-90"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm leading-tight font-semibold">rcwOwO</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Peepochat is built by myself, rcwOwO. I love to build tools for
                both Twitch streamers and viewers.
              </p>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Learn more at{" "}
              <DeveloperLink href={RCW_URL} className="text-xs">
                rcw.lol
              </DeveloperLink>
              . Or, you can find me on{" "}
              <DeveloperLink href={BLUESKY_URL} className="text-xs">
                Bluesky
              </DeveloperLink>
              .
            </p>
          </div>
        </div>
      </div>

      <a
        href={PATREON_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative isolate flex items-center gap-4 overflow-hidden rounded-lg border border-[color-mix(in_oklch,white_18%,var(--border))] bg-[radial-gradient(ellipse_90%_120%_at_0%_50%,color-mix(in_oklch,white_14%,transparent),transparent_58%),radial-gradient(ellipse_80%_100%_at_100%_40%,color-mix(in_oklch,white_8%,transparent),transparent_52%),linear-gradient(135deg,color-mix(in_oklch,white_7%,var(--background)),color-mix(in_oklch,white_3%,var(--muted)))] p-3.5 shadow-[inset_0_1px_0_color-mix(in_oklch,white_12%,transparent)] transition-[border-color,box-shadow] hover:border-[color-mix(in_oklch,white_32%,var(--border))] hover:shadow-[0_0_26px_-10px_color-mix(in_oklch,white_22%,transparent),inset_0_1px_0_color-mix(in_oklch,white_16%,transparent)] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 motion-safe:animate-pulse"
          style={{
            background:
              "linear-gradient(105deg, transparent 38%, color-mix(in oklch, white 14%, transparent) 50%, transparent 62%)",
          }}
        />

        <div className="relative flex shrink-0 items-center justify-center px-1 py-2">
          <div
            aria-hidden
            className="absolute inset-0 scale-125 rounded-full bg-[color-mix(in_oklch,white_18%,transparent)] blur-lg"
          />
          <div className="relative motion-safe:animate-about-badge-float motion-reduce:animate-none">
            <img
              src={OWO_SUPPORTER_BADGE_IMAGE}
              alt=""
              className="size-11 drop-shadow-[0_4px_14px_color-mix(in_oklch,white_30%,transparent),0_0_20px_color-mix(in_oklch,white_12%,transparent)]"
            />
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="bg-linear-to-r from-foreground via-[color-mix(in_oklch,white_65%,var(--foreground))] to-[color-mix(in_oklch,white_40%,var(--muted-foreground))] bg-clip-text text-sm leading-tight font-semibold text-transparent">
              Become an OwO+ member!
            </p>
            <ExternalLinkIcon className="size-3.5 shrink-0 text-[color-mix(in_oklch,white_45%,var(--muted-foreground))] transition-colors group-hover:text-foreground" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Help keep the project free for everyone and earn an exclusive badge that appears next to your username for all Peepochat users!
          </p>
        </div>
      </a>
    </div>
  )
}

export function AboutTab() {
  return (
    <div className="space-y-6 pb-2">
      <div className="relative -mx-4 -mt-4 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              "radial-gradient(ellipse 90% 70% at 50% -8%, color-mix(in oklch, var(--primary) 42%, transparent), transparent 72%)",
              "linear-gradient(to bottom, color-mix(in oklch, var(--primary) 20%, var(--popover)) 0%, color-mix(in oklch, var(--primary) 9%, var(--popover)) 38%, var(--popover) 82%)",
            ].join(", "),
          }}
        />
        <div className="pointer-events-none absolute -top-12 right-0 size-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute top-8 -left-16 size-36 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative flex flex-col items-center px-4 pt-6 pb-8 text-center">
          <div className="relative shrink-0">
            <div className="absolute inset-0 scale-110 rounded-2xl bg-primary/30 blur-md" />
            <img
              src={iconBkgSrc}
              alt=""
              className="relative size-16 rounded-2xl object-cover shadow-lg ring-1 ring-primary/25"
            />
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5">
            <p className="text-sm leading-snug font-semibold tracking-tight">
              Thanks for using Peepochat!
            </p>
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground/90">
              v{version}
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <SectionHeading
          title="Developed by"
          description="Who built this thing?"
        />
        <DevelopedBySection />
      </section>

      <section className="space-y-2">
        <SectionHeading
          title="Services we rely on"
          description="Peepochat wouldn't work without these projects and services."
        />
        <CreditsList credits={SERVICE_CREDITS} />
      </section>
    </div>
  )
}
