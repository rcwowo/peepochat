import { ChatvoiceImportPanel } from "@/components/chatvoice/chatvoice-import-panel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ChatvoiceImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Chatvoice</DialogTitle>
          <DialogDescription className="text-pretty">
            Choose the backup you exported from Chatvoice to bring over your
            voices, sounds, filters, and channels. You can also do this later
            from Settings &gt; Data Management.
          </DialogDescription>
        </DialogHeader>
        <ChatvoiceImportPanel onImported={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
