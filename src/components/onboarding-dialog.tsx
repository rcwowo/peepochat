import * as React from "react"
import {
  ArrowRightIcon,
  CloudUploadIcon,
  MessagesSquareIcon,
  SettingsIcon,
  WifiIcon,
} from "lucide-react"
import { toast } from "sonner"

import iconSrc from "/icon.png"
import logoSrc from "/logo.png"
import { useChatvoiceSettings } from "@/lib/chatvoice-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type OnboardingStep = "welcome" | "channel"

const TRACKED_STEPS: OnboardingStep[] = ["channel"]

export function OnboardingDialog({
  open,
  onComplete,
}: {
  open: boolean
  onComplete: () => void
}) {
  const { updateConfig, restoreBackup } = useChatvoiceSettings()
  const [step, setStep] = React.useState<OnboardingStep>("welcome")
  const [channel, setChannel] = React.useState("")
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const handleImportBackup = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const payload = await file.text()
      await restoreBackup(payload)
      toast.success("Backup restored. Welcome back!")
      onComplete()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Backup restore failed"
      )
    } finally {
      event.target.value = ""
    }
  }

  const handleFinish = () => {
    const trimmed = channel.trim()
    if (!trimmed) {
      toast.error("Please enter a Twitch channel name.")
      return
    }

    updateConfig((current) => ({
      ...current,
      twitch: {
        ...current.twitch,
        channel: trimmed.replace(/^#/, "").toLowerCase(),
      },
    }))
    toast.success("You're all set!")
    onComplete()
  }

  if (!open) return null

  const isWelcome = step === "welcome"

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-background duration-500 fade-in">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 size-96 animate-in rounded-full bg-primary/6 blur-3xl duration-1000 zoom-in-50 fade-in" />
        <div className="absolute -bottom-24 -left-24 size-72 animate-in rounded-full bg-primary/4 blur-3xl delay-200 duration-1000 fill-mode-backwards zoom-in-50 fade-in" />
        {isWelcome && (
          <div className="absolute top-1/2 left-1/2 size-150 -translate-x-1/2 -translate-y-1/2 animate-in rounded-full bg-primary/3 blur-[120px] duration-1500 fade-in" />
        )}
      </div>

      <div
        className={`relative flex w-full flex-col items-center px-6 ${isWelcome ? "max-w-lg" : "max-w-md"}`}
      >
        {isWelcome && (
          <WelcomeStep
            onContinue={() => setStep("channel")}
            onImportClick={() => fileInputRef.current?.click()}
          />
        )}

        {!isWelcome && (
          <div className="flex w-full animate-in flex-col items-center duration-500 fade-in slide-in-from-bottom-4">
            <div className="mb-8 flex w-full max-w-xs gap-2 self-center">
              {TRACKED_STEPS.map((s, i) => {
                const currentIndex = TRACKED_STEPS.indexOf(step)
                return (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                      i <= currentIndex ? "bg-primary" : "bg-border"
                    }`}
                  />
                )
              })}
            </div>

            <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-lg ring-1 ring-foreground/3">
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Connect to chat
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter the Twitch channel you want to follow. You can change
                    this later in the header.
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-sm">Twitch channel</Label>
                  <Input
                    placeholder="Channel name"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFinish()
                    }}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("welcome")}
                  >
                    Back
                  </Button>
                  <Button className="flex-1" onClick={handleFinish}>
                    Finish setup
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportBackup}
      />
    </div>
  )
}

function WelcomeStep({
  onContinue,
  onImportClick,
}: {
  onContinue: () => void
  onImportClick: () => void
}) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center">
      <div className="relative animate-in duration-700 zoom-in-50 fade-in">
        <div className="absolute -inset-4 rounded-full bg-primary/8 blur-2xl" />
        <img
          src={iconSrc}
          alt=""
          className="relative size-20 drop-shadow-xl dark:brightness-150 dark:contrast-75 dark:invert dark:saturate-0"
        />
      </div>

      <div className="mt-8 flex animate-in flex-col items-center delay-200 duration-600 fill-mode-backwards fade-in slide-in-from-bottom-3">
        <img src={logoSrc} alt="Peepochat" className="h-9 dark:invert" />
        <p className="mt-3 text-center text-[15px] leading-relaxed text-muted-foreground">
          A focused Twitch chat client for the web. No account required — your
          settings stay on this device.
        </p>
      </div>

      <div className="mt-10 grid w-full animate-in grid-cols-3 gap-3 delay-400 duration-600 fill-mode-backwards fade-in slide-in-from-bottom-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.label}
            className="flex flex-col items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-3 py-4 text-center"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <feature.icon className="size-4.5 text-primary" />
            </div>
            <span className="text-xs leading-snug font-medium text-muted-foreground">
              {feature.label}
            </span>
          </div>
        ))}
      </div>

      <Button
        className="mt-10 w-full max-w-xs animate-in delay-600 duration-500 fill-mode-backwards fade-in slide-in-from-bottom-2"
        size="lg"
        onClick={onContinue}
      >
        Get started
        <ArrowRightIcon className="size-4" />
      </Button>

      <Button
        variant="outline"
        className="mt-3 w-full max-w-xs"
        onClick={onImportClick}
      >
        <CloudUploadIcon className="size-4" />
        Restore from backup
      </Button>

      <p className="mt-2 animate-in text-xs text-muted-foreground/60 delay-700 duration-500 fill-mode-backwards fade-in">
        No account required. All data is stored in your browser.
      </p>
    </div>
  )
}

const FEATURES = [
  { icon: MessagesSquareIcon, label: "Live chat" },
  { icon: WifiIcon, label: "IRC connection" },
  { icon: SettingsIcon, label: "Local backups" },
]
