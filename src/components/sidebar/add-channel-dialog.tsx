import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

export function AddChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addChannel } = usePeepochatSettings()
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setDraft("")
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    const value = draft.trim()
    if (!value || submitting) {
      return
    }

    setSubmitting(true)
    try {
      await addChannel(value)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add channel"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-hotkey-surface="add-channel" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add channel</DialogTitle>
          <DialogDescription>
            Enter a username to join their channel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="add-channel-input">Channel name</Label>
          <Input
            id="add-channel-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Channel name"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit()
            }}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!draft.trim() || submitting}
          >
            {submitting ? "Adding…" : "Add channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
