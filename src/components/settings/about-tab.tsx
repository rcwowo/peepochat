import { ExternalLinkIcon, HeartIcon } from "lucide-react"

import logoSrc from "/logo.svg"
import {
  SectionHeading,
  SettingsChip,
  SettingsChipPrimary,
} from "@/components/settings/settings-primitives"

const version: string = __APP_VERSION__
const iconBkgSrc = "/icon-bkg.png"

const SERVICE_CREDITS = [
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
] as const

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

        <div className="relative space-y-4 px-4 pt-5 pb-7">
          <div className="flex flex-col items-start gap-3.5">
            <div className="relative shrink-0">
              <div className="absolute inset-0 scale-110 rounded-2xl bg-primary/30 blur-md" />
              <img
                src={iconBkgSrc}
                alt=""
                className="relative size-16 rounded-2xl object-cover shadow-lg ring-1 ring-primary/25"
              />
            </div>
            <div className="min-w-0">
              <img
                src={logoSrc}
                alt="Peepochat"
                className="brand-mark h-7 w-auto max-w-full"
              />
              <p className="mt-1.5 font-mono text-[11px] tracking-wide text-muted-foreground/90">
                v{version}
              </p>
            </div>
          </div>

          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            A lightweight Twitch chat client for the web. Sign in with Twitch,
            follow channels from the sidebar, and keep your layout on this device.
          </p>

          <div className="flex flex-wrap gap-1.5">
            <SettingsChipPrimary href="https://streamelements.com/rcwowo/tip">
              <HeartIcon className="size-3" />
              Support the project
            </SettingsChipPrimary>
            <SettingsChip href="https://bsky.app/profile/rcw.lol">
              <ExternalLinkIcon className="size-3" />
              Bluesky
            </SettingsChip>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <SectionHeading
          title="Services we rely on"
          description="Peepochat wouldn't work without these projects and APIs. We're grateful they exist."
        />
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {SERVICE_CREDITS.map((credit) => (
            <li key={credit.name}>
              <a
                href={credit.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-3 px-2.5 py-2.5 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight group-hover:text-foreground">
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
      </section>
    </div>
  )
}
