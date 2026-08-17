import * as React from "react"
import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  Columns2Icon,
  HashIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { APP_BRANDING } from "@/lib/branding"
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
  type DesktopNotificationPermission,
} from "@/lib/highlights/desktop-notifications"
import {
  clearAllOnboardingState,
  clearOnboardingSession,
  dismissOnboardingFinalStep,
  getOnboardingFlow,
  hasDismissedOnboardingFinalStep,
  isImportOnboardingApplied,
  markImportOnboardingApplied,
  setOnboardingFlow,
  type OnboardingFlow,
} from "@/lib/peepochat/onboarding-storage"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  createDefaultConfig,
  isLoggedOutWithSavedSetup,
  loadConfig,
  parseBackupPreview,
  type BackupPreview,
} from "@/lib/peepochat/peepochat-config"
import { cn } from "@/lib/utils"

const PERMISSIONS_DOCS_URL =
  "https://wiki.rcw.lol/s/peepochat/doc/permissions-LSAfFeqlWT"

type OnboardingStep =
  "landing" | "import-review" | "login" | "channel" | "notifications"

const STEP_FLOW_ORDER: Record<OnboardingStep, number> = {
  landing: 0,
  "import-review": 1,
  login: 2,
  channel: 3,
  notifications: 4,
}

function notificationsAlreadyAllowed(): boolean {
  return getDesktopNotificationPermission() === "granted"
}

function needsNotificationsStep({
  flow,
  finalStepDismissed,
  isReturningUser,
}: {
  flow: OnboardingFlow
  finalStepDismissed: boolean
  isReturningUser: boolean
}): boolean {
  if (isReturningUser || finalStepDismissed) return false
  if (flow === "import") return !notificationsAlreadyAllowed()
  return flow === "fresh"
}

function resolveStep({
  flow,
  step,
  hasAccount,
  hasChannels,
  finalStepDismissed,
  isReturningUser,
}: {
  flow: OnboardingFlow
  step: OnboardingStep
  hasAccount: boolean
  hasChannels: boolean
  finalStepDismissed: boolean
  isReturningUser: boolean
}): OnboardingStep {
  if (step === "landing") {
    if (isReturningUser) return "login"
    if (hasAccount && !hasChannels) return "channel"
    return "landing"
  }
  if (step === "import-review") return "import-review"

  if (!hasAccount) return "login"
  if (!hasChannels) return "channel"
  if (step === "channel") return "channel"
  if (needsNotificationsStep({ flow, finalStepDismissed, isReturningUser })) {
    return "notifications"
  }

  return step
}

function shouldCompleteOnboarding({
  flow,
  hasAccount,
  hasChannels,
  finalStepDismissed,
  isReturningUser,
}: {
  flow: OnboardingFlow
  hasAccount: boolean
  hasChannels: boolean
  finalStepDismissed: boolean
  isReturningUser: boolean
}): boolean {
  if (!hasAccount || !hasChannels) return false
  return !needsNotificationsStep({ flow, finalStepDismissed, isReturningUser })
}

function formatBackupDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function OnboardingDialog({
  open,
  onComplete,
}: {
  open: boolean
  onComplete: () => void
}) {
  const {
    config,
    account,
    channels,
    oauthBusy,
    isOAuthConfigured,
    loginWithTwitch,
    logout,
    addChannel,
    restoreBackup,
    updateConfig,
  } = usePeepochatSettings()

  const isReturningUser = isLoggedOutWithSavedSetup(config)

  const [flow, setFlow] = React.useState<OnboardingFlow>(
    () => getOnboardingFlow() ?? "fresh"
  )
  const [step, setStep] = React.useState<OnboardingStep>(() => {
    const storedFlow = getOnboardingFlow()
    const returning = isLoggedOutWithSavedSetup(loadConfig())

    if (storedFlow === "import" && isImportOnboardingApplied()) return "login"
    if (storedFlow === "fresh") return "login"
    if (!storedFlow && returning) return "login"
    return "landing"
  })
  const [channel, setChannel] = React.useState("")
  const [addingChannel, setAddingChannel] = React.useState(false)
  const [importPreview, setImportPreview] =
    React.useState<BackupPreview | null>(null)
  const pendingBackupPayloadRef = React.useRef<string | null>(null)
  const [importBusy, setImportBusy] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (isReturningUser && getOnboardingFlow() === null) {
      setOnboardingFlow("fresh")
    }
  }, [isReturningUser])

  const finalStepDismissed = hasDismissedOnboardingFinalStep()
  const hasAccount = Boolean(account)
  const hasChannels = channels.length > 0

  const resolvedStep = resolveStep({
    flow,
    step,
    hasAccount,
    hasChannels,
    finalStepDismissed,
    isReturningUser,
  })

  React.useEffect(() => {
    if (!open) return
    if (
      shouldCompleteOnboarding({
        flow,
        hasAccount,
        hasChannels,
        finalStepDismissed,
        isReturningUser,
      })
    ) {
      dismissOnboardingFinalStep()
      clearOnboardingSession()
      onComplete()
    }
  }, [
    open,
    flow,
    hasAccount,
    hasChannels,
    finalStepDismissed,
    isReturningUser,
    onComplete,
  ])

  const goToLanding = () => {
    clearOnboardingSession()
    setImportPreview(null)
    pendingBackupPayloadRef.current = null
    setFlow("fresh")
    setStep("landing")
  }

  const restartOnboarding = () => {
    clearAllOnboardingState()
    setImportPreview(null)
    pendingBackupPayloadRef.current = null
    setChannel("")
    setFlow("fresh")
    updateConfig(() => createDefaultConfig())
    setStep("landing")
  }

  const startFreshSetup = () => {
    setFlow("fresh")
    setOnboardingFlow("fresh")
    setStep("login")
  }

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const payload = await file.text()
      const preview = parseBackupPreview(payload)
      setFlow("import")
      setOnboardingFlow("import")
      pendingBackupPayloadRef.current = payload
      setImportPreview(preview)
      setStep("import-review")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read backup file"
      )
    } finally {
      event.target.value = ""
    }
  }

  const handleConfirmImport = async () => {
    const payload = pendingBackupPayloadRef.current
    if (!payload) return

    setImportBusy(true)
    try {
      await restoreBackup(payload)
      markImportOnboardingApplied()
      pendingBackupPayloadRef.current = null
      setStep("login")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Backup restore failed"
      )
    } finally {
      setImportBusy(false)
    }
  }

  const resolveChannelLogin = () =>
    channel.trim().replace(/^#/, "") || account?.login?.trim() || ""

  const handleFinishChannel = async () => {
    const trimmed = resolveChannelLogin()
    if (!trimmed) {
      toast.error("Please enter a Twitch channel name.")
      return
    }

    setAddingChannel(true)
    try {
      await addChannel(trimmed)
      if (
        !needsNotificationsStep({
          flow,
          finalStepDismissed: hasDismissedOnboardingFinalStep(),
          isReturningUser,
        })
      ) {
        dismissOnboardingFinalStep()
        clearOnboardingSession()
        onComplete()
      } else {
        setStep("notifications")
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add channel"
      )
    } finally {
      setAddingChannel(false)
    }
  }

  const goBackFromChannel = () => {
    setChannel("")
    updateConfig((current) => ({
      ...current,
      twitch: {
        ...current.twitch,
        channels: [],
        activeChannelLogin: "",
      },
      layout: {
        activeSplitId: null,
        splits: [],
        sidebarOrder: [],
      },
    }))
    logout()
    setStep("login")
  }

  const handleFinishOnboarding = () => {
    dismissOnboardingFinalStep()
    clearOnboardingSession()
    onComplete()
  }

  const [stepTransition, setStepTransition] = React.useState({
    step: resolvedStep,
    direction: 1,
  })
  let stepDirection = stepTransition.direction
  if (stepTransition.step !== resolvedStep) {
    stepDirection =
      STEP_FLOW_ORDER[resolvedStep] >= STEP_FLOW_ORDER[stepTransition.step]
        ? 1
        : -1
    setStepTransition({
      step: resolvedStep,
      direction: stepDirection,
    })
  }

  const stepContent = (() => {
    switch (resolvedStep) {
      case "landing":
        return {
          landing: true as const,
          title: "Let's get started.",
          description: "You can either start from scratch, or import a backup.",
          body: (
            <LandingStepBody
              onStartFresh={startFreshSetup}
              onImportClick={() => fileInputRef.current?.click()}
            />
          ),
          footer: undefined,
        }
      case "login": {
        const loginCopy = getLoginStepCopy(flow, isReturningUser)
        return {
          title: loginCopy.title,
          description: (
            <>
              {loginCopy.description}
              {!isOAuthConfigured ? (
                <p className="mt-3 text-sm text-destructive">
                  Set VITE_TWITCH_CLIENT_ID in your environment to enable login.
                </p>
              ) : null}
            </>
          ),
          body: undefined,
          footer: (
            <LoginStepFooter
              canGoBack={flow === "import" || !isReturningUser}
              oauthBusy={oauthBusy}
              isOAuthConfigured={isOAuthConfigured}
              onLogin={loginWithTwitch}
              onBack={flow === "import" ? restartOnboarding : goToLanding}
            />
          ),
        }
      }
      case "channel":
        return {
          title: "Pick a channel.",
          description: (
            <>
              Type the name of a channel to start chatting in.
              <br />
              You can add more channels via the sidebar later.
            </>
          ),
          body: (
            <ChannelStepBody
              channel={channel}
              placeholder={account?.login?.trim() || "Enter a username..."}
              onChannelChange={setChannel}
              onSubmit={() => void handleFinishChannel()}
            />
          ),
          footer: (
            <ChannelStepFooter
              busy={addingChannel}
              canContinue={Boolean(resolveChannelLogin())}
              onBack={goBackFromChannel}
              onContinue={() => void handleFinishChannel()}
            />
          ),
        }
      case "import-review":
        return importPreview
          ? {
              title: "Does this look right?",
              description:
                "Make sure the information is correct before importing.",
              body: <ImportReviewStepBody preview={importPreview} />,
              footer: (
                <ImportReviewStepFooter
                  busy={importBusy}
                  onBack={goToLanding}
                  onContinue={() => void handleConfirmImport()}
                />
              ),
            }
          : null
      case "notifications":
        return {
          title: "Receive notifications?",
          description:
            "You can receive notifications for pings or when a channel goes live while the client is open.",
          body: <NotificationsStepBody />,
          footer: (
            <NotificationsStepFooter
              onBack={
                flow === "import"
                  ? () => {
                      logout()
                      setStep("login")
                    }
                  : () => setStep("channel")
              }
              onFinish={handleFinishOnboarding}
            />
          ),
        }
    }
  })()

  if (!open || !stepContent) return null

  return (
    <div className="landing-page dark fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_15%_-10%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_65%),radial-gradient(ellipse_55%_40%_at_90%_15%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_60%),radial-gradient(ellipse_50%_45%_at_50%_110%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_55%)]" />
        <div className="brand-dot-grid-mask">
          <div className="brand-dot-grid" />
        </div>
      </div>

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-[610px]">
          <OnboardingShell
            stepKey={resolvedStep}
            direction={stepDirection}
            landing={stepContent.landing === true}
            title={stepContent.title}
            description={stepContent.description}
            footer={stepContent.footer}
          >
            {stepContent.body}
          </OnboardingShell>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  )
}

function OnboardingShell({
  stepKey,
  direction,
  title,
  description,
  children,
  footer,
  landing = false,
}: {
  stepKey: string
  direction: number
  title: string
  description: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  landing?: boolean
}) {
  const hasFooter = footer != null

  return (
    <div className="relative pt-8 sm:pt-10">
      <div
        className="absolute top-0 left-1/2 z-10 -translate-x-1/2"
        aria-hidden
      >
        <img
          src={APP_BRANDING.appIcon}
          alt=""
          className="size-16 object-cover shadow-[0_6px_18px_rgba(0,0,0,0.35)] sm:size-20"
        />
      </div>

      <div className="flex h-[360px] w-full max-w-[610px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-card sm:h-[420px]">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-7 sm:px-10",
            landing
              ? "pt-16 pb-10 sm:pt-[4.5rem] sm:pb-12"
              : "pt-14 pb-6 sm:pt-16"
          )}
        >
          <div
            key={stepKey}
            className={cn(
              "my-auto w-full animate-in duration-300 ease-out fade-in motion-reduce:animate-none motion-reduce:opacity-100",
              direction >= 0 ? "slide-in-from-right-4" : "slide-in-from-left-4"
            )}
          >
            <div className="text-center">
              <h1 className="font-landing-display text-[40px] leading-none font-semibold tracking-tight text-balance">
                {title}
              </h1>
              <div
                className={cn(
                  "text-pretty text-muted-foreground",
                  landing
                    ? "mt-1.5 text-base leading-none font-normal"
                    : "mx-auto mt-1.5 max-w-[34rem] text-base leading-snug"
                )}
              >
                {description}
              </div>
            </div>

            {children ? (
              <div className={cn(landing ? "mt-[35px]" : "mt-6 sm:mt-7")}>
                {children}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[height,border-color] duration-300 ease-out motion-reduce:transition-none",
            hasFooter
              ? "h-[65px] border-t border-white/8"
              : "h-0 border-t border-transparent"
          )}
        >
          <div
            key={hasFooter ? stepKey : "footer-empty"}
            className={cn(
              "flex h-[65px] items-center justify-between gap-3 bg-background/55 px-5 sm:px-6",
              hasFooter &&
                "animate-in duration-300 ease-out fade-in motion-reduce:animate-none"
            )}
          >
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}

function OnboardingBackButton({
  onClick,
  label = "Go Back",
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
    >
      <ChevronLeftIcon className="size-4" aria-hidden />
      {label}
    </button>
  )
}

function OnboardingActionRow({
  onClick,
  icon: Icon,
  title,
  description,
  size = "default",
}: {
  onClick: () => void
  icon: LucideIcon
  title: string
  description?: string
  size?: "default" | "hero"
}) {
  const isHero = size === "hero"

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-[30px] rounded-xl bg-background px-6 text-left transition-colors hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        isHero ? "h-[110px]" : "h-[50px]"
      )}
    >
      <Icon className="size-[22px] shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-landing-display leading-none font-semibold tracking-tight text-foreground",
            isHero ? "text-[20px]" : "text-[14px]"
          )}
        >
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[13px] leading-none font-normal text-primary">
            {description}
          </span>
        ) : null}
      </span>
      <ArrowRightIcon
        className="size-4 shrink-0 text-foreground/80 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  )
}

function LandingStepBody({
  onStartFresh,
  onImportClick,
}: {
  onStartFresh: () => void
  onImportClick: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <OnboardingActionRow
        onClick={onStartFresh}
        icon={SparklesIcon}
        title="Start fresh"
        description="Recommended for new users"
        size="hero"
      />
      <OnboardingActionRow
        onClick={onImportClick}
        icon={CloudUploadIcon}
        title="Restore a backup"
      />
    </div>
  )
}

function getLoginStepCopy(flow: OnboardingFlow, isReturningUser: boolean) {
  if (flow === "import") {
    return {
      title: "You'll need to log back in.",
      description:
        "To finish importing this backup, you'll need to login again.",
    }
  }

  if (isReturningUser) {
    return {
      title: "Let's sign back in.",
      description:
        "Your channels and settings are still here. Reconnect Twitch to jump back into chat.",
    }
  }

  return {
    title: "Let's sign in.",
    description: (
      <>
        Peepochat needs access to your Twitch account in order to send and
        receive messages. All data is stored on this device.
        <br />
        You can learn more about the permissions needed{" "}
        <a
          href={PERMISSIONS_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          here
        </a>
        .
      </>
    ),
  }
}

function LoginStepFooter({
  canGoBack,
  oauthBusy,
  isOAuthConfigured,
  onLogin,
  onBack,
}: {
  canGoBack: boolean
  oauthBusy: boolean
  isOAuthConfigured: boolean
  onLogin: () => void
  onBack: () => void
}) {
  return (
    <>
      {canGoBack ? <OnboardingBackButton onClick={onBack} /> : <span />}
      <Button
        size="lg"
        className="h-10 gap-1.5 px-4 text-sm"
        onClick={onLogin}
        disabled={oauthBusy || !isOAuthConfigured}
      >
        {oauthBusy ? "Signing in…" : "Login with Twitch"}
        <ChevronRightIcon className="size-4" aria-hidden />
      </Button>
    </>
  )
}

function ChannelStepBody({
  channel,
  placeholder,
  onChannelChange,
  onSubmit,
}: {
  channel: string
  placeholder: string
  onChannelChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="flex items-center gap-1.5 rounded-xl bg-background px-3 py-1 focus-within:ring-2 focus-within:ring-primary/30">
        <HashIcon className="size-4 shrink-0 text-muted-foreground" />
        <Input
          id="onboarding-channel"
          placeholder={placeholder}
          value={channel}
          onChange={(event) =>
            onChannelChange(event.target.value.replace(/^#/, ""))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit()
          }}
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          autoFocus
        />
      </div>
    </div>
  )
}

function ChannelStepFooter({
  busy,
  canContinue,
  onBack,
  onContinue,
}: {
  busy: boolean
  canContinue: boolean
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <>
      <OnboardingBackButton onClick={onBack} />
      <Button
        size="lg"
        className="h-10 gap-1.5 px-4 text-sm"
        onClick={onContinue}
        disabled={busy || !canContinue}
      >
        {busy ? "Adding…" : "Next Step"}
        <ChevronRightIcon className="size-4" aria-hidden />
      </Button>
    </>
  )
}

function ImportPreviewRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "truncate text-sm",
          muted ? "text-muted-foreground" : "font-medium"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function ImportReviewStepBody({ preview }: { preview: BackupPreview }) {
  const exportedLabel = formatBackupDate(preview.exportedAt)
  const metaParts = [
    exportedLabel,
    preview.appVersion ? `v${preview.appVersion}` : null,
  ].filter(Boolean)
  const visibleItems = preview.sidebarItems.slice(0, 6)
  const hiddenItemCount = preview.sidebarItems.length - visibleItems.length
  const fromLabel =
    preview.accountDisplayName?.trim() || preview.accountLogin || null

  return (
    <div className="mx-auto w-full max-w-[28rem] space-y-3 rounded-xl bg-background/70 px-4 py-3">
      {fromLabel ? <ImportPreviewRow label="From" value={fromLabel} /> : null}

      {metaParts.length > 0 ? (
        <ImportPreviewRow label="Backup" value={metaParts.join(" · ")} muted />
      ) : null}

      <ImportPreviewRow label="Ping rules" value={preview.pingRuleCount} />

      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Channels
        </p>
        {preview.channelCount === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">None</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {visibleItems.map((item, index) =>
              item.type === "split" ? (
                <span
                  key={`split-${item.names.join("-")}-${index}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-card px-2 py-1 text-xs"
                  title={item.names.map((name) => `#${name}`).join(" · ")}
                >
                  <Columns2Icon
                    className="size-3 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate">
                    {item.names.map((name, nameIndex) => (
                      <React.Fragment key={`${name}-${nameIndex}`}>
                        {nameIndex > 0 ? (
                          <span className="text-muted-foreground"> · </span>
                        ) : null}
                        <span>{name}</span>
                      </React.Fragment>
                    ))}
                  </span>
                </span>
              ) : (
                <span
                  key={`channel-${item.name}-${index}`}
                  className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs"
                >
                  <HashIcon
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {item.name}
                </span>
              )
            )}
            {hiddenItemCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-1 text-xs text-muted-foreground">
                +{hiddenItemCount} more
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function ImportReviewStepFooter({
  busy,
  onBack,
  onContinue,
}: {
  busy: boolean
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <>
      <OnboardingBackButton onClick={onBack} />
      <Button
        size="lg"
        className="h-10 gap-1.5 px-4 text-sm"
        onClick={onContinue}
        disabled={busy}
      >
        {busy ? "Importing…" : "Next Step"}
        <ChevronRightIcon className="size-4" aria-hidden />
      </Button>
    </>
  )
}

function NotificationsStepBody() {
  const [permission, setPermission] =
    React.useState<DesktopNotificationPermission>(() =>
      getDesktopNotificationPermission()
    )
  const [requesting, setRequesting] = React.useState(false)

  const checked = permission === "granted"
  const disabled =
    requesting || permission === "unsupported" || permission === "denied"

  const handleCheckedChange = async (next: boolean) => {
    if (!next || checked || disabled) return

    setRequesting(true)
    try {
      const result = await requestDesktopNotificationPermission()
      setPermission(result)
      if (result === "denied") {
        toast.error("Notifications blocked in browser settings")
      } else if (result === "unsupported") {
        toast.error("Notifications are not supported in this browser")
      }
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="flex items-center gap-3 rounded-xl bg-background px-4 py-3">
        <BellIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium">
          Enable notifications
        </span>
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => void handleCheckedChange(next)}
          aria-label="Enable notifications"
        />
      </div>
      {permission === "denied" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Notifications are blocked in your browser. You can enable them later
          in site settings.
        </p>
      ) : null}
    </div>
  )
}

function NotificationsStepFooter({
  onBack,
  onFinish,
}: {
  onBack: () => void
  onFinish: () => void
}) {
  return (
    <>
      <OnboardingBackButton onClick={onBack} />
      <Button
        size="lg"
        className="h-10 gap-1.5 px-4 text-sm"
        onClick={onFinish}
      >
        Finish
        <CheckIcon className="size-4" aria-hidden />
      </Button>
    </>
  )
}
