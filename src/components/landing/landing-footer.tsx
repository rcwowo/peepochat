import { ExternalLinkIcon } from "lucide-react"
import { Link } from "react-router-dom"

import {
  getLandingFooterHref,
  isLandingFooterLinkExternal,
  LANDING_FOOTER_LINKS,
  RCW_URL,
} from "@/lib/landing/landing-footer-links"

const version: string = __APP_VERSION__

export function LandingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16 lg:px-8">
        <div className="flex flex-col">
          <Link
            to="/"
            className="inline-flex w-fit"
            aria-label="Peepochat home"
          >
            <img
              src="/logo-transparent.png"
              alt=""
              width={84}
              height={50}
              className="h-11 w-auto sm:h-14"
              loading="lazy"
              decoding="async"
            />
          </Link>

          <div className="mt-8 flex flex-col gap-1">
            <p className="text-sm leading-snug text-foreground">
              an{" "}
              <a
                href={RCW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#ed5ea6] transition-colors hover:text-[#ed5ea6]/80"
              >
                rcw.lol
              </a>{" "}
              project
              <span className="ml-1 text-xs text-muted-foreground">
                v{version}
              </span>
            </p>
            <p className="text-sm leading-snug text-foreground">
              &copy; {year} All Rights Reserved.
            </p>
          </div>
        </div>

        <ul
          className="flex flex-col items-start gap-2.5 sm:items-end"
          role="list"
        >
          {LANDING_FOOTER_LINKS.map((item) => {
            const href = getLandingFooterHref(item.href, item.label)
            const external = isLandingFooterLinkExternal(href)
            const showExternalIcon = href.startsWith("http")

            return (
              <li key={item.label}>
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                  {showExternalIcon ? (
                    <ExternalLinkIcon className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
                  ) : null}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </footer>
  )
}
