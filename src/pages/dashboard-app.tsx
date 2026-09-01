import * as React from "react"
import { toast } from "sonner"
import { SparklesIcon } from "lucide-react"

import {
  PeepochatProvider,
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import {
  hasNewVersion,
  initLastSeenVersion,
  markVersionSeen,
} from "@/lib/changelog"
import { useChannelSidebarVisibility } from "@/hooks/use-channel-sidebar-visibility"
import { useAppHotkeys } from "@/hooks/use-app-hotkeys"
import { HotkeyRegistryProvider } from "@/lib/hotkeys/hotkey-registry"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/shell/app-header"
import { ChannelSidebar } from "@/components/sidebar/channel-sidebar"
import { AddChannelDialog } from "@/components/sidebar/add-channel-dialog"
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog"
import {
  SettingsDialog,
  type SettingsCategory,
} from "@/components/settings/settings-dialog"
import { shouldPreventSettingsDismiss } from "@/lib/settings/settings-portaled-layers"
import { ChatPage } from "@/pages/chat-page"
import { PlayerPage } from "@/pages/player-page"
import { cn } from "@/lib/utils"

function DashboardLayout() {
  const { ready, needsOnboarding, completeOnboarding } = usePeepochatSettings()
  const { playerChannelLogin, playerViewActive } = usePeepochatPlayer()
  const { channelSidebarVisible, toggleChannelSidebar } =
    useChannelSidebarVisibility()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsInitialCategory, setSettingsInitialCategory] = React.useState<
    SettingsCategory | undefined
  >(undefined)
  const [addChannelOpen, setAddChannelOpen] = React.useState(false)
  const [notificationsOpen, setNotificationsOpen] = React.useState(false)

  const openSettings = React.useCallback(() => {
    setSettingsInitialCategory(undefined)
    setNotificationsOpen(false)
    setSettingsOpen(true)
  }, [])
  const toggleSettings = React.useCallback(() => {
    setSettingsOpen((open) => {
      if (!open) {
        setSettingsInitialCategory(undefined)
        setNotificationsOpen(false)
      }
      return !open
    })
  }, [])
  const openAddChannel = React.useCallback(() => {
    setAddChannelOpen(true)
  }, [])
  const toggleAddChannel = React.useCallback(() => {
    setAddChannelOpen((open) => !open)
  }, [])
  const handleNotificationsOpenChange = React.useCallback((open: boolean) => {
    if (open) {
      setSettingsOpen(false)
    }
    setNotificationsOpen(open)
  }, [])
  const toggleNotifications = React.useCallback(() => {
    setNotificationsOpen((open) => {
      if (!open) {
        setSettingsOpen(false)
      }
      return !open
    })
  }, [])

  useAppHotkeys({
    enabled: ready && !needsOnboarding,
    settingsOpen,
    addChannelOpen,
    notificationsOpen,
    toggleSettings,
    toggleAddChannel,
    toggleNotifications,
    toggleSidebar: toggleChannelSidebar,
  })

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
            setNotificationsOpen(false)
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
      {channelSidebarVisible ? (
        <ChannelSidebar onAddChannel={openAddChannel} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader
          onSettingsClick={openSettings}
          channelSidebarVisible={channelSidebarVisible}
          onChannelSidebarToggle={toggleChannelSidebar}
          notificationsOpen={notificationsOpen}
          onNotificationsOpenChange={handleNotificationsOpenChange}
        />
        <SidebarInset className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--chat-background)]">
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 min-w-0",
              playerViewActive
                ? "pointer-events-none z-0 opacity-0"
                : "z-10 opacity-100"
            )}
            aria-hidden={playerViewActive}
            inert={playerViewActive}
          >
            <ChatPage active={!playerViewActive} />
          </div>
          {playerChannelLogin ? (
            <div
              className={cn(
                "absolute inset-0 flex min-h-0 min-w-0",
                playerViewActive
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
              )}
              aria-hidden={!playerViewActive}
              inert={!playerViewActive}
            >
              <PlayerPage />
            </div>
          ) : null}
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
      <AddChannelDialog
        open={addChannelOpen}
        onOpenChange={setAddChannelOpen}
      />
    </SidebarProvider>
  )
}

export function DashboardApp() {
  return (
    <PeepochatProvider>
      <HotkeyRegistryProvider>
        <DashboardLayout />
      </HotkeyRegistryProvider>
    </PeepochatProvider>
  )
}
