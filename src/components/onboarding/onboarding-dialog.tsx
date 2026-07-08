import * as React from "react"
import {
  BookmarkIcon,
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  HashIcon,
  LogInIcon,
  MessageSquareIcon,
  RadioIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Link } from "react-router-dom"

import logoSrc from "/branding/full-logo.svg"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  clearOnboardingSession,
  dismissBookmarkPrompt,
  getOnboardingFlow,
  hasDismissedBookmarkPrompt,
  isImportOnboardingApplied,
  markImportOnboardingApplied,
  setOnboardingFlow,
  type OnboardingFlow,
} from "@/lib/peepochat/onboarding-storage"
import {
  isLoggedOutWithSavedSetup,
  loadConfig,
  parseBackupPreview,
  type BackupPreview,
} from "@/lib/peepochat/peepochat-config"
import {
  TWITCH_OAUTH_SCOPE_GROUPS,
  type TwitchOAuthScopeGroup,
} from "@/lib/twitch/twitch-oauth-scopes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
  type DesktopNotificationPermission,
} from "@/lib/highlights/desktop-notifications"

type OnboardingStep =
  | "landing"
  | "import-review"
  | "login"
  | "channel"
  | "bookmark"

type StepDefinition = {
  id: OnboardingStep
  label: string
}

function getStepDefinitions(
  flow: OnboardingFlow,
  isReturningUser: boolean
): StepDefinition[] {
  if (flow === "import") {
    return [
      { id: "import-review", label: "Backup" },
      { id: "login", label: "Sign in" },
    ]
  }

  if (isReturningUser) {
    return [{ id: "login", label: "Sign in" }]
  }

  return [
    { id: "login", label: "Sign in" },
    { id: "channel", label: "Channel" },
    { id: "bookmark", label: "Finish" },
  ]
}

function resolveStep({
  flow,
  step,
  hasAccount,
  hasChannels,
  bookmarkDismissed,
  isReturningUser,
}: {
  flow: OnboardingFlow
  step: OnboardingStep
  hasAccount: boolean
  hasChannels: boolean
  bookmarkDismissed: boolean
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
  if (flow === "fresh" && !isReturningUser && !bookmarkDismissed)
    return "bookmark"

  return step
}

function shouldCompleteOnboarding({
  flow,
  hasAccount,
  hasChannels,
  bookmarkDismissed,
  isReturningUser,
}: {
  flow: OnboardingFlow
  hasAccount: boolean
  hasChannels: boolean
  bookmarkDismissed: boolean
  isReturningUser: boolean
}): boolean {
  if (!hasAccount || !hasChannels) return false
  if (flow === "import" || isReturningUser) return true
  return bookmarkDismissed
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

function getBookmarkShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Bookmark this page"
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘ D" : "Ctrl D"
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
    addChannel,
    restoreBackup,
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

  const bookmarkDismissed = hasDismissedBookmarkPrompt()
  const hasAccount = Boolean(account)
  const hasChannels = channels.length > 0
  const setupStarted = step !== "landing"

  const resolvedStep = resolveStep({
    flow,
    step,
    hasAccount,
    hasChannels,
    bookmarkDismissed,
    isReturningUser,
  })

  const stepDefinitions = getStepDefinitions(flow, isReturningUser)
  const currentStepIndex = stepDefinitions.findIndex(
    (entry) => entry.id === resolvedStep
  )

  React.useEffect(() => {
    if (!open) return
    if (
      shouldCompleteOnboarding({
        flow,
        hasAccount,
        hasChannels,
        bookmarkDismissed,
        isReturningUser,
      })
    ) {
      clearOnboardingSession()
      onComplete()
    }
  }, [
    open,
    flow,
    hasAccount,
    hasChannels,
    bookmarkDismissed,
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

  const handleFinishChannel = async () => {
    const trimmed = channel.trim()
    if (!trimmed) {
      toast.error("Please enter a Twitch channel name.")
      return
    }

    setAddingChannel(true)
    try {
      await addChannel(trimmed)
      if (isReturningUser || hasDismissedBookmarkPrompt()) {
        clearOnboardingSession()
        onComplete()
      } else {
        setStep("bookmark")
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add channel"
      )
    } finally {
      setAddingChannel(false)
    }
  }

  const handleDismissBookmark = () => {
    dismissBookmarkPrompt()
    clearOnboardingSession()
    onComplete()
  }

  if (!open) return null

  return (
    <div className="landing-page dark fixed inset-0 z-50 min-h-svh overflow-y-auto bg-background text-foreground">
      <div
        className="landing-grain pointer-events-none fixed inset-0 z-0"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_70%_45%_at_20%_-5%,color-mix(in_oklch,var(--primary)_32%,transparent),transparent_60%),radial-gradient(ellipse_50%_35%_at_85%_20%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_55%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src={logoSrc}
              alt="Peepochat"
              className="h-7 w-auto brand-mark"
            />
          </Link>
          {setupStarted &&
            stepDefinitions.length > 1 &&
            currentStepIndex >= 0 && (
              <StepTrail
                steps={stepDefinitions}
                currentIndex={currentStepIndex}
              />
            )}
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-6 sm:py-8">
          <div
            key={resolvedStep}
            className={cn(
              "w-full animate-in duration-200 fade-in motion-reduce:animate-none",
              resolvedStep === "login" ? "max-w-4xl" : "max-w-2xl"
            )}
          >
            {resolvedStep === "landing" && (
              <NewLandingStep
                onStartFresh={startFreshSetup}
                onImportClick={() => fileInputRef.current?.click()}
              />
            )}

            {resolvedStep === "login" && (
              <LoginStep
                flow={flow}
                isReturningUser={isReturningUser}
                canGoBack={flow === "fresh" && !isReturningUser}
                oauthBusy={oauthBusy}
                isOAuthConfigured={isOAuthConfigured}
                onLogin={loginWithTwitch}
                onBack={goToLanding}
              />
            )}

            {resolvedStep === "channel" && (
              <ChannelStep
                channel={channel}
                addingChannel={addingChannel}
                onChannelChange={setChannel}
                onFinish={() => void handleFinishChannel()}
              />
            )}

            {resolvedStep === "import-review" && importPreview && (
              <ImportReviewStep
                preview={importPreview}
                busy={importBusy}
                onCancel={goToLanding}
                onConfirm={() => void handleConfirmImport()}
              />
            )}

            {resolvedStep === "bookmark" && (
              <BookmarkStep
                shortcutLabel={getBookmarkShortcutLabel()}
                onContinue={handleDismissBookmark}
              />
            )}
          </div>
        </main>
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

function StepTrail({
  steps,
  currentIndex,
}: {
  steps: StepDefinition[]
  currentIndex: number
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      {steps.map((entry, index) => {
        const isComplete = index < currentIndex
        const isCurrent = index === currentIndex

        return (
          <React.Fragment key={entry.id}>
            {index > 0 && (
              <div
                className={cn(
                  "hidden h-px w-4 shrink-0 self-center sm:block",
                  isComplete ? "bg-primary/50" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm",
                isCurrent && "bg-primary/15 text-primary",
                isComplete && "text-muted-foreground",
                !isCurrent && !isComplete && "text-muted-foreground/50"
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-semibold tabular-nums sm:size-5 sm:text-[11px]",
                  isCurrent && "bg-primary text-primary-foreground",
                  isComplete && "bg-primary/25 text-primary",
                  !isCurrent && !isComplete && "bg-muted text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <CheckIcon className="size-2.5 sm:size-3" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden leading-none sm:inline">
                {entry.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function OnboardingHeading({
  title,
  description,
  centered = true,
}: {
  title: string
  description: string
  centered?: boolean
}) {
  return (
    <div className={cn("max-w-xl", centered && "mx-auto text-center")}>
      <h1 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function NewLandingStep({
  onStartFresh,
  onImportClick,
}: {
  onStartFresh: () => void
  onImportClick: () => void
}) {
  return (
    <div className="space-y-8">
      <OnboardingHeading
        title="Let's get started."
        description="You can start from scratch or restore your settings from a backup."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <LandingChoiceCard
          onClick={onStartFresh}
          icon={<SparklesIcon className="size-5 text-primary" />}
          title="Start fresh"
          description="New to Peepochat? Start from scratch and set up your own custom configuration."
          action="Set up from scratch"
        />

        <LandingChoiceCard
          onClick={onImportClick}
          icon={<CloudUploadIcon className="size-5 text-primary" />}
          title="Restore a backup"
          description="Have a Peepochat backup file? Restore your settings and channels from a backup."
          action="Choose backup file"
        />
      </div>
    </div>
  )
}

function LandingChoiceCard({
  onClick,
  icon,
  title,
  description,
  action,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
  action: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/12 bg-[color-mix(in_oklch,var(--card)_80%,transparent)] p-6 text-left backdrop-blur-sm transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-[color-mix(in_oklch,var(--primary)_35%,transparent)] hover:shadow-[0_16px_40px_-20px_color-mix(in_oklch,var(--primary)_30%,transparent)]"
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
        {icon}
      </div>
      <h2 className="mt-4 font-landing-display text-xl font-semibold">
        {title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        {action}
        <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

function LoginStep({
  flow,
  isReturningUser,
  canGoBack,
  oauthBusy,
  isOAuthConfigured,
  onLogin,
  onBack,
}: {
  flow: OnboardingFlow
  isReturningUser: boolean
  canGoBack: boolean
  oauthBusy: boolean
  isOAuthConfigured: boolean
  onLogin: () => void
  onBack: () => void
}) {
  const title =
    flow === "import"
      ? "You'll need to log back in"
      : isReturningUser
        ? "Let's sign back in"
        : "Let's sign in"

  const description =
    flow === "import"
      ? "To finish importing this backup, you'll need to login again."
      : isReturningUser
        ? "Your channels and settings are ready — just reconnect Twitch to jump back into chat."
        : "Peepochat needs Twitch access to read and send chat. Everything else stays on this device."

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm">
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex flex-col justify-center border-b border-white/8 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
              <LogInIcon className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="font-landing-display text-2xl font-semibold tracking-tight text-balance sm:text-[1.65rem]">
                {title}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <Button
              size="lg"
              className="h-11 w-full text-base"
              onClick={onLogin}
              disabled={oauthBusy || !isOAuthConfigured}
            >
              {oauthBusy ? "Signing in…" : "Continue with Twitch"}
            </Button>

            {!isOAuthConfigured && (
              <p className="text-sm text-destructive">
                Set VITE_TWITCH_CLIENT_ID in your environment to enable login.
              </p>
            )}

            {canGoBack && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={onBack}
              >
                Nevermind, go back
              </Button>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">
              Peepochat needs these permissions
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            These are the necessary permissions needed for Peepochat to
            function. Don't worry, everything stays on your device, and you can
            revoke these permissions at any time through your Twitch account
            settings.
          </p>

          <ScrollArea className="mt-4 h-[min(50vh,400px)] pr-2">
            <div className="space-y-3">
              {TWITCH_OAUTH_SCOPE_GROUPS.map((group) => (
                <OAuthScopeGroupCard key={group.id} group={group} />
              ))}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  )
}

const OAUTH_SCOPE_GROUP_META: Record<
  TwitchOAuthScopeGroup["id"],
  { icon: LucideIcon; accent: string }
> = {
  chat: {
    icon: MessageSquareIcon,
    accent: "bg-[color-mix(in_oklch,var(--primary)_6%,transparent)]",
  },
  moderation: {
    icon: ShieldIcon,
    accent: "bg-[color-mix(in_oklch,var(--chart-2)_6%,transparent)]",
  },
  broadcast: {
    icon: RadioIcon,
    accent: "bg-[color-mix(in_oklch,var(--chart-4)_6%,transparent)]",
  },
}

function OAuthScopeGroupCard({ group }: { group: TwitchOAuthScopeGroup }) {
  const meta = OAUTH_SCOPE_GROUP_META[group.id]
  const Icon = meta.icon

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-white/8",
        meta.accent
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/50">
          <Icon className="size-4 text-foreground/80" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-tight font-semibold">{group.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {group.description}
          </p>
        </div>
      </div>

      <ul className="grid gap-x-4 gap-y-2.5 border-t border-white/6 px-3.5 py-3 sm:grid-cols-2">
        {group.scopes.map((entry) => (
          <li key={entry.scope} className="flex gap-2.5">
            <CheckIcon
              className="mt-0.5 size-3.5 shrink-0 text-white"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm leading-tight font-medium">{entry.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {entry.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ChannelStep({
  channel,
  addingChannel,
  onChannelChange,
  onFinish,
}: {
  channel: string
  addingChannel: boolean
  onChannelChange: (value: string) => void
  onFinish: () => void
}) {
  return (
    <div className="space-y-8">
      <OnboardingHeading
        title="Where are we heading?"
        description="Type the name of a channel you want to start chatting in. You can add more channels via the sidebar later."
      />

      <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm sm:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-1 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
          <HashIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            id="onboarding-channel"
            placeholder="channel name"
            value={channel}
            onChange={(event) => onChannelChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onFinish()
            }}
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            autoFocus
          />
        </div>

        <Button
          className="mt-4 h-11 w-full"
          size="lg"
          onClick={onFinish}
          disabled={!channel.trim() || addingChannel}
        >
          {addingChannel ? "Opening channel…" : "Open chat"}
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function ImportReviewStep({
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: BackupPreview
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const exportedLabel = formatBackupDate(preview.exportedAt)
  const visibleChannels = preview.channelNames.slice(0, 12)
  const hiddenChannelCount =
    preview.channelNames.length - visibleChannels.length

  return (
    <div className="space-y-8">
      <OnboardingHeading
        title="Does this look right?"
        description="Make sure the information is correct before importing."
      />

      <div className="rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm sm:p-6">
        {(exportedLabel || preview.appVersion) && (
          <div className="grid gap-5 border-b border-white/8 pb-5 sm:grid-cols-2">
            {exportedLabel && (
              <PreviewField label="Exported" value={exportedLabel} />
            )}
            {preview.appVersion && (
              <PreviewField label="Version" value={preview.appVersion} />
            )}
          </div>
        )}

        <div className="space-y-5 pt-5">
          {preview.accountDisplayName && (
            <PreviewField
              label="Export from"
              value={
                preview.accountLogin
                  ? `${preview.accountDisplayName} (@${preview.accountLogin})`
                  : preview.accountDisplayName
              }
            />
          )}

          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Channels
            </p>
            {preview.channelCount === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visibleChannels.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-background/40 px-2.5 py-1 text-sm"
                  >
                    <HashIcon className="size-3 text-muted-foreground" />
                    {name}
                  </span>
                ))}
                {hiddenChannelCount > 0 && (
                  <span className="inline-flex items-center px-2 py-1 text-sm text-muted-foreground">
                    +{hiddenChannelCount} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-5 border-t border-white/8 pt-5 sm:grid-cols-2">
            <PreviewField label="Splits" value={String(preview.splitCount)} />
            <PreviewField
              label="Ping rules"
              value={String(preview.pingRuleCount)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:mx-auto sm:max-w-md sm:grid-cols-2">
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          onClick={onCancel}
          disabled={busy}
        >
          Back
        </Button>
        <Button size="lg" className="h-11" onClick={onConfirm} disabled={busy}>
          {busy ? "Importing…" : "Import & continue"}
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function BookmarkStep({
  shortcutLabel,
  onContinue,
}: {
  shortcutLabel: string
  onContinue: () => void
}) {
  const keys = shortcutLabel.split(" ")
  const [notificationPermission, setNotificationPermission] =
    React.useState<DesktopNotificationPermission>(() =>
      getDesktopNotificationPermission()
    )
  const [requestingNotifications, setRequestingNotifications] =
    React.useState(false)

  const requestNotifications = async () => {
    setRequestingNotifications(true)
    try {
      const result = await requestDesktopNotificationPermission()
      setNotificationPermission(result)
      if (result === "denied") {
        toast.error("Notifications blocked in browser settings")
      } else if (result === "unsupported") {
        toast.error("Notifications are not supported in this browser")
      }
    } finally {
      setRequestingNotifications(false)
    }
  }

  const notificationsReady = notificationPermission === "granted"
  const notificationsUnsupported = notificationPermission === "unsupported"
  const notificationsDenied = notificationPermission === "denied"

  return (
    <div className="space-y-8">
      <OnboardingHeading
        title="You're all set!"
        description="Everything is setup and ready to go - a couple optional things before you jump in."
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm sm:p-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12">
              <BookmarkIcon className="size-6 text-primary" />
            </div>
            <div className="mt-4 sm:mt-0 sm:ml-4">
              <p className="text-sm font-medium">Bookmark this page</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                If you plan to come back, save Peepochat so you don't have to
                dig through your history later. Press{" "}
                <span className="inline-flex items-center gap-1 align-middle">
                  {keys.map((key) => (
                    <kbd
                      key={key}
                      className="inline-flex items-center justify-center rounded-md border border-white/12 bg-background/70 px-2 py-0.5 font-mono text-xs font-semibold"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>{" "}
                to bookmark now, or do it whenever you're ready.
              </p>
            </div>
          </div>
        </div>

        {!notificationsUnsupported ? (
          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm sm:p-8">
            <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12">
                <BellIcon className="size-6 text-primary" />
              </div>
              <div className="mt-4 min-w-0 sm:mt-0 sm:ml-4">
                <p className="text-sm font-medium">Enable notifications</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {notificationsReady
                    ? "You're all set to receive ping and live alerts when Peepochat isn't focused."
                    : notificationsDenied
                      ? "Notifications are blocked in your browser. You can enable them later in site settings."
                      : "Get pinged when your highlight rules match or a channel goes live while you're away."}
                </p>
              </div>
            </div>

            {!notificationsReady && !notificationsDenied ? (
              <Button
                className="mt-6 h-11 w-full"
                size="lg"
                variant="outline"
                onClick={() => void requestNotifications()}
                disabled={requestingNotifications}
              >
                {requestingNotifications ? "Enabling…" : "Enable notifications"}
              </Button>
            ) : null}

            {notificationsReady ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-primary sm:justify-start">
                <CheckIcon className="size-4" />
                Notifications enabled
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button className="h-11 w-full" size="lg" onClick={onContinue}>
        Open chat
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  )
}
