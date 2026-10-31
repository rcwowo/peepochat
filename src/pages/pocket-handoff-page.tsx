import * as React from "react"

import { Button } from "@/components/ui/button"
import type { PocketHandoff } from "@/lib/twitch/auth/pocket-handoff"

export function PocketHandoffPage({ handoff }: { handoff: PocketHandoff }) {
  React.useEffect(() => {
    window.history.replaceState(null, "", "/")
    window.location.replace(handoff.url)
  }, [handoff.url])

  return (
    <main className="dark flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <img src="/branding/icon.svg" alt="" className="size-16" />
        <h1 className="text-xl font-semibold">
          {handoff.failed
            ? "Sign-in didn't finish"
            : "Signed in to Peepochat Pocket"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {handoff.failed
            ? "Head back to the app to try again."
            : "You can head back to the app now. If it didn't open on its own, tap the button below."}
        </p>
        <Button asChild size="lg" className="w-full">
          <a href={handoff.url}>Open Peepochat Pocket</a>
        </Button>
      </div>
    </main>
  )
}
