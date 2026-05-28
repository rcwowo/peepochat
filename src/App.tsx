import * as React from "react"
import { toast } from "sonner"
import { SparklesIcon } from "lucide-react"

import { PeepochatProvider, usePeepochatSettings } from "@/lib/peepochat-context"
import { hasNewVersion, initLastSeenVersion, markVersionSeen } from "@/lib/changelog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/app-header"
import { ChannelSidebar } from "@/components/channel-sidebar"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import {
  SettingsDialog,
  type SettingsCategory,
} from "@/components/settings-dialog"
import { ChatPage } from "@/pages/chat-page"

function DashboardLayout() {
  const { ready, needsOnboarding, completeOnboarding } = usePeepochatSettings()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsInitialCategory, setSettingsInitialCategory] =
    React.useState<SettingsCategory | undefined>(undefined)

  React.useEffect(() => {
    if (!ready || needsOnboarding) return

    if (hasNewVersion()) {
      toast("Peepochat has been updated since your last visit!", {
        icon: <SparklesIcon className="size-4" />,
        duration: 10_000,
        action: {
          label: "What's new",
          onClick: () => {
            setSettingsInitialCategory("changelog")
            setSettingsOpen(true)
            markVersionSeen()
          },
        },
        onDismiss: () => markVersionSeen(),
      })
    }
  }, [ready, needsOnboarding])

  if (!ready) {
    return <div className="min-h-svh bg-background" />
  }

  if (needsOnboarding) {
    return (
      <div className="min-h-svh bg-background">
        <OnboardingDialog
          open
          onComplete={() => {
            initLastSeenVersion()
            completeOnboarding()
          }}
        />
      </div>
    )
  }

  return (
    <SidebarProvider
      open={false}
      onOpenChange={() => {}}
      className="relative flex h-svh w-full flex-col"
      style={
        { "--sidebar-width-icon": "4.5rem" } as React.CSSProperties
      }
    >
      <AppHeader
        onSettingsClick={() => {
          setSettingsInitialCategory(undefined)
          setSettingsOpen(true)
        }}
      />
      <div className="flex min-h-0 w-full flex-1">
        <ChannelSidebar />
        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <ChatPage />
        </SidebarInset>
      </div>
      {settingsOpen && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-50 hidden sm:block"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialCategory={settingsInitialCategory}
      />
    </SidebarProvider>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <PeepochatProvider>
        <DashboardLayout />
      </PeepochatProvider>
    </TooltipProvider>
  )
}

export default App
