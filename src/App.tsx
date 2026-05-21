import * as React from "react"
import { toast } from "sonner"
import { SparklesIcon } from "lucide-react"

import { ChatvoiceProvider, useChatvoiceSettings } from "@/lib/chatvoice-context"
import { hasNewVersion, initLastSeenVersion, markVersionSeen } from "@/lib/changelog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/app-header"
import { ChannelSidebar } from "@/components/channel-sidebar"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { ChangelogDialog } from "@/components/changelog-dialog"
import { ChatPage } from "@/pages/chat-page"

function DashboardLayout() {
  const { ready, needsOnboarding, completeOnboarding } = useChatvoiceSettings()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [changelogOpen, setChangelogOpen] = React.useState(false)

  React.useEffect(() => {
    if (!ready || needsOnboarding) return

    if (hasNewVersion()) {
      toast("Peepochat has been updated since your last visit!", {
        icon: <SparklesIcon className="size-4" />,
        duration: 10_000,
        action: {
          label: "What's new",
          onClick: () => setChangelogOpen(true),
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
      className="flex h-svh w-full flex-col"
      style={
        { "--sidebar-width-icon": "4.5rem" } as React.CSSProperties
      }
    >
      <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 w-full flex-1">
        <ChannelSidebar />
        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
            <ChatPage />
          </div>
        </SidebarInset>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
    </SidebarProvider>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <ChatvoiceProvider>
        <DashboardLayout />
      </ChatvoiceProvider>
    </TooltipProvider>
  )
}

export default App
