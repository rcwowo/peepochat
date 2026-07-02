import * as React from "react"

import {
  type ChangelogEntry,
  CHANGELOG,
  getAppVersion,
  markVersionSeen,
} from "@/lib/changelog"
import { Badge } from "@/components/ui/badge"
import { SettingsTab } from "@/components/settings/settings-primitives"

export function ChangelogTab() {
  React.useEffect(() => {
    markVersionSeen()
  }, [])

  return (
    <SettingsTab
      title="Changelog"
      description={`You're on version ${getAppVersion()}. Here's what changed in recent releases.`}
    >
      <div className="space-y-5">
        {CHANGELOG.map((entry) => (
          <ChangelogSection key={entry.version} entry={entry} />
        ))}
      </div>
    </SettingsTab>
  )
}

function ChangelogSection({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          v{entry.version}
        </Badge>
        <span className="text-xs text-muted-foreground">{entry.date}</span>
      </div>
      <ul className="space-y-1 pl-4 text-sm text-muted-foreground">
        {entry.items.map((item) => (
          <li key={item} className="list-disc pl-0.5">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
