import * as React from "react"
import { toast } from "sonner"
import { SparklesIcon } from "lucide-react"

import {
  PeepochatProvider,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import {
  hasNewVersion,
  initLastSeenVersion,
  markVersionSeen,
} from "@/lib/changelog"
import { useChannelSidebarVisibility } from "@/hooks/use-channel-sidebar-visibility"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/shell/app-header"
import { ChannelSidebar } from "@/components/sidebar/channel-sidebar"
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog"
import {
  SettingsDialog,
  type SettingsCategory,
} from "@/components/settings/settings-dialog"
import { shouldPreventSettingsDismiss } from "@/lib/settings/settings-portaled-layers"
import { ChatPage } from "@/pages/chat-page"

function DashboardLayout() {
  const { ready, needsOnboarding, completeOnboarding } = usePeepochatSettings()
  const { channelSidebarVisible, toggleChannelSidebar } =
    useChannelSidebarVisibility()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsInitialCategory, setSettingsInitialCategory] = React.useState<
    SettingsCategory | undefined
  >(undefined)

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
      className="relative flex h-svh w-full flex-row"
      style={{ "--sidebar-width-icon": "4.375rem" } as React.CSSProperties}
    >
      {channelSidebarVisible ? <ChannelSidebar /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader
          onSettingsClick={() => {
            setSettingsInitialCategory(undefined)
            setSettingsOpen(true)
          }}
          channelSidebarVisible={channelSidebarVisible}
          onChannelSidebarToggle={toggleChannelSidebar}
        />
        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <ChatPage />
        </SidebarInset>
      </div>
      {settingsOpen && (
        <button
          type="button"
          aria-label="Close panel"
          className="absolute inset-0 z-50 hidden cursor-default border-0 bg-black/55 sm:block"
          onPointerDown={() => {
            if (shouldPreventSettingsDismiss(null)) {
              return
            }

            setSettingsOpen(false)
          }}
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

export function DashboardApp() {
  return (
    <PeepochatProvider>
      <DashboardLayout />
    </PeepochatProvider>
  )
}
