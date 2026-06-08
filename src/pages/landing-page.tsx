import "@/components/landing/landing-animations.css"

import { Link } from "react-router-dom"
import {
  ArrowRightIcon,
  BellIcon,
  CloudOffIcon,
  Columns2Icon,
  HistoryIcon,
  PaintRollerIcon,
  SmileIcon,
} from "lucide-react"

import { EmoteShowcaseSection } from "@/components/landing/emote-showcase-section"
import { LayoutShowcaseSection } from "@/components/landing/layout-showcase-section"
import { HeroChatMockup } from "@/components/landing/hero-chat-mockup"
import { LandingFooter } from "@/components/landing/landing-footer"
import { Button } from "@/components/ui/button"
import logoSrc from "/logo.svg"

const FEATURE_ACCENT = "from-primary/30 to-primary/5"

const FEATURES = [
  {
    icon: Columns2Icon,
    title: "Splits & Layouts",
    description:
      "Arrange channels in any way you like horizontal or vertical splits, that you can resize and rearrange as you please.",
  },
  {
    icon: SmileIcon,
    title: "All The Emotes",
    description:
      "Whether it's native Twitch emotes, or third-party emotes from BetterTTV, FrankerFaceZ, or 7TV, they're all available.",
  },
  {
    icon: BellIcon,
    title: "Customizable Pings",
    description:
      "With the app open, you can get browser notifications for custom keywords and phrases that you define.",
  },
  {
    icon: HistoryIcon,
    title: "Message History",
    description:
      "Missed out on the conversation? No worries! Peepochat integrates with APIs to show chat messages from before you even connected.",
  },
  {
    icon: PaintRollerIcon,
    title: "Make It Yours",
    description:
      "Customize your experience to your liking with settings for appearance, behavior, pings, backups, and more to come.",
  },
  {
    icon: CloudOffIcon,
    title: "Your Data, Period.",
    description:
      "Did we say backups? That's right. All of your data is stored locally in your browser. You can backup and restore all your settings at any time.",
  },
] as const

export function LandingPage() {
  return (
    <div className="landing-page dark min-h-svh bg-background text-foreground">
      <div className="landing-grain pointer-events-none fixed inset-0 z-0" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_15%_-10%,color-mix(in_oklch,var(--primary)_28%,transparent),transparent_65%),radial-gradient(ellipse_55%_40%_at_90%_15%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_60%)]"
        aria-hidden
      />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoSrc} alt="Peepochat" className="brand-mark h-7 w-auto" />
          </Link>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href="#features">Features</a>
            </Button>
            <Button size="sm" asChild>
              <Link to="/app">
                Open app
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </nav>
        </header>

        <main>
          <section className="overflow-visible pt-8 lg:pt-12">
            <div className="mx-auto w-full max-w-6xl px-6">
              <div className="mx-auto flex max-w-2xl flex-col items-center space-y-8 text-center">
                <div
                  className="animate-landing-fade-up motion-reduce:animate-none"
                  style={{ animationDelay: "0ms" }}
                >
                  <h1 className="font-landing-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
                    The chat client
                    <br />
                    <span className="text-primary">you don't download.</span>
                  </h1>
                </div>

                <p
                  className="animate-landing-fade-up text-lg leading-relaxed text-muted-foreground motion-reduce:animate-none"
                  style={{ animationDelay: "80ms" }}
                >
                  Peepochat is a fully-featured Twitch chat client that runs entirely within
                  your browser. Customizable layouts, third-party emotes, message history, and more.
                  Everything stays in your browser.
                </p>

                <div
                  className="animate-landing-fade-up motion-reduce:animate-none"
                  style={{ animationDelay: "160ms" }}
                >
                  <Button size="lg" asChild>
                    <Link to="/app">
                      Launch Peepochat
                      <ArrowRightIcon className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div className="pointer-events-none relative z-2 -mb-44 mt-12 flex w-screen max-w-none -translate-x-1/2 justify-center overflow-visible px-[clamp(1rem,4vw,2rem)] left-1/2">
            <div
              className="animate-landing-fade-up pointer-events-auto w-[min(52rem,94vw)] motion-reduce:animate-none"
              style={{ animationDelay: "120ms" }}
            >
              <HeroChatMockup />
            </div>
          </div>

          <section
            id="features"
            className="relative z-1 border-t border-white/8 bg-black/20 pt-52"
          >
            <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
              <div className="mb-12 max-w-2xl">
                <p className="font-landing-display text-sm font-medium tracking-[0.18em] text-primary uppercase">
                  Features
                </p>
                <h2 className="font-landing-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Chatting to the fullest extent.
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {FEATURES.map((feature, index) => (
                  <article
                    key={feature.title}
                    className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <div
                      className="animate-landing-fade-up-short h-full rounded-2xl border border-white/8 bg-card/40 p-6 backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[color-mix(in_oklch,var(--primary)_35%,transparent)] hover:shadow-[0_12px_28px_-12px_color-mix(in_oklch,var(--primary)_25%,transparent)] motion-reduce:animate-none"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div
                        className={`mb-5 inline-flex rounded-xl bg-linear-to-br ${FEATURE_ACCENT} p-3`}
                      >
                        <feature.icon className="size-5 text-primary" />
                      </div>
                      <h3 className="font-landing-display text-xl font-semibold">
                        {feature.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <LayoutShowcaseSection />

          <EmoteShowcaseSection />

          <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
            <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-[color-mix(in_oklch,var(--card)_80%,transparent)] px-8 py-12 text-center sm:px-12">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_70%),linear-gradient(to_bottom,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
                aria-hidden
              />
              <h2 className="font-landing-display relative text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to peep the chat?
              </h2>
              <p className="relative mx-auto mt-4 max-w-lg text-muted-foreground">
                Jump into a channel in seconds. Customize your layout, load your
                emotes, and keep everything local.
              </p>
              <Button size="lg" className="relative mt-8" asChild>
                <Link to="/app">
                  Open Peepochat
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </div>
  )
}
