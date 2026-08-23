import { ExternalLinkIcon } from "lucide-react"

import {
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { getHotkeyHelpRows } from "@/lib/hotkeys/help"

const HELP_LINKS = [
  {
    name: "Guides",
    description: "Learn how to use Peepochat and its features.",
    href: "https://wiki.rcw.lol/s/peepochat/doc/guides-HdOG0hPjrb",
  },
  {
    name: "Roadmap",
    description: "See what's upcoming in future releases.",
    href: "https://wiki.rcw.lol/s/peepochat/doc/roadmap-0bNKnk0jzb",
  },
]

function HelpLinkList() {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
      {HELP_LINKS.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-3 px-2.5 py-2.5 transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <div className="min-w-0">
              <div className="text-sm leading-tight font-medium group-hover:text-foreground">
                {link.name}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {link.description}
              </p>
            </div>
            <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function HotkeyChip({ label }: { label: string }) {
  return (
    <kbd className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] leading-none text-foreground">
      {label}
    </kbd>
  )
}

export function HelpTab() {
  const rows = getHotkeyHelpRows()

  return (
    <SettingsTab title="Help" description="Learn more about using Peepochat.">
      <SettingsSection
        title="Peepochat Wiki"
        description="All the documentation regarding Peepochat."
      >
        <HelpLinkList />
      </SettingsSection>

      <SettingsSection
        title="Keyboard shortcuts"
        description="Quickly navigate through the client with your keyboard."
      >
        <SettingsGroup>
          {rows.map((row) => (
            <div
              key={row.action}
              className="flex items-start justify-between gap-3 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight font-medium">
                  {row.title}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {row.description}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {row.labels.map((label) => (
                  <HotkeyChip key={label} label={label} />
                ))}
              </div>
            </div>
          ))}
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
