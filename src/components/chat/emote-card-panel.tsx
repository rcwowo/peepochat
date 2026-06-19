import * as React from "react"
import { createPortal } from "react-dom"
import { ExternalLinkIcon, PaletteIcon, TagIcon, UserIcon, XIcon } from "lucide-react"

import { PickerIcon } from "@/components/chat/picker-icon"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { useEmoteCard } from "@/hooks/chat/use-emote-card"
import { EMOTE_PLATFORM_META } from "@/lib/chat/emote-platform-meta"
import {
  getEmotePlatformUrl,
  getLargeEmotePreviewUrl,
  getTwitchChannelUrl,
  type EmoteCardDetails,
  type EmoteCardTarget,
} from "@/lib/chat/emote-card"
import {
  determineEmoteRatioBucket,
  emoteCardMinWidthClass,
  EMOTE_CARD_PREVIEW_IMAGE_CLASS,
  emoteCardPreviewSizeClass,
  type EmoteRatioBucket,
} from "@/lib/chat/emote-picker-layout"
import { cn } from "@/lib/utils"

type EmoteCardPanelProps = {
  target: EmoteCardTarget
  card: ReturnType<typeof useEmoteCard>
  ratioBucket: EmoteRatioBucket
  onRatioBucket: (bucket: EmoteRatioBucket) => void
  anchorPosition: { left: number; top: number }
  dragOffset: { x: number; y: number }
  panelRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void
  onRetry: () => void
}

function openExternalUrl(url: string) {
  if (!url) {
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

function InfoTile({
  icon,
  label,
  value,
  href,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  href?: string | null
}) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <div className="mb-1 flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium break-all hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <div className="font-medium break-all">{value}</div>
      )}
    </div>
  )
}

function EmoteCardPreview({
  target,
  previewUrl,
  ratioBucket,
  onRatioBucket,
}: {
  target: EmoteCardTarget
  previewUrl: string
  ratioBucket: EmoteRatioBucket
  onRatioBucket: (bucket: EmoteRatioBucket) => void
}) {
  return (
    <div
      className={cn(
        "box-border flex shrink-0 items-center justify-center rounded-xl bg-muted/50 p-2",
        emoteCardPreviewSizeClass(ratioBucket)
      )}
    >
      <img
        src={previewUrl}
        alt={target.code}
        className={EMOTE_CARD_PREVIEW_IMAGE_CLASS}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const img = event.currentTarget
          onRatioBucket(determineEmoteRatioBucket(img.naturalWidth, img.naturalHeight))
        }}
      />
    </div>
  )
}

function resolveArtistTile(details: EmoteCardDetails) {
  const artist = details.artist
  if (!artist) {
    return null
  }

  const href = details.artistLogin
    ? getTwitchChannelUrl(details.artistLogin)
    : null

  return { artist, href }
}

function resolveUploaderTile(details: EmoteCardDetails) {
  const uploader = details.uploader
  if (!uploader) {
    return null
  }

  const href = details.uploaderLogin
    ? getTwitchChannelUrl(details.uploaderLogin)
    : null

  return { uploader, href }
}

export function EmoteCardPanel({
  target,
  card,
  ratioBucket,
  onRatioBucket,
  anchorPosition,
  dragOffset,
  panelRef,
  onClose,
  onDragStart,
  onRetry,
}: EmoteCardPanelProps) {
  const platform = EMOTE_PLATFORM_META[target.provider]
  const details = card.details
  const previewUrl = getLargeEmotePreviewUrl(target)
  const platformUrl =
    details?.platformUrl ?? getEmotePlatformUrl(target.provider, target.id)
  const showChannelAction =
    target.provider === "twitch" && Boolean(details?.channelUrl)
  const showPlatformAction = target.provider !== "twitch"
  const showActions = showPlatformAction || showChannelAction
  const artistTile = details ? resolveArtistTile(details) : null
  const uploaderTile =
    target.provider !== "twitch" && details
      ? resolveUploaderTile(details)
      : null
  const canonicalName = details?.name ?? target.code
  const isAliasView = canonicalName.toLowerCase() !== target.code.toLowerCase()
  const displayName = isAliasView ? target.code : canonicalName
  const infoTileCount =
    Number(isAliasView) + Number(Boolean(artistTile)) + Number(Boolean(uploaderTile))
  const showLoadingSkeleton = card.status === "loading" && infoTileCount > 0

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${displayName} emote card`}
      className={cn(
        "fixed z-50 w-max max-w-[min(20rem,90vw)] overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-md outline-hidden",
        emoteCardMinWidthClass(ratioBucket)
      )}
      style={{
        left: anchorPosition.left,
        top: anchorPosition.top,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="absolute top-2 right-2 z-10 bg-popover/85 shadow-sm"
        aria-label="Close emote card"
        onClick={onClose}
      >
        <XIcon className="size-3" />
      </Button>

      <div
        className="cursor-grab touch-none px-4 pt-4 pb-3 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <EmoteCardPreview
            target={target}
            previewUrl={previewUrl}
            ratioBucket={ratioBucket}
            onRatioBucket={onRatioBucket}
          />
          <div className="min-w-0 max-w-full px-1">
            <div className="truncate text-base font-semibold leading-tight">
              {displayName}
            </div>
            <div className="mt-1.5 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <PickerIcon
                src={platform.iconSrc}
                className="size-4 shrink-0 bg-foreground"
              />
              {platform.label}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {showLoadingSkeleton ? (
          <div
            className={cn(
              "grid gap-2",
              infoTileCount > 1 ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            {Array.from({ length: infoTileCount }, (_, index) => (
              <Skeleton key={index} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : null}

        {card.status === "error" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{card.error}</p>
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}

        {details && infoTileCount > 0 && card.status !== "loading" ? (
          <div
            className={cn(
              "grid gap-2 text-xs",
              infoTileCount > 1 ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            {isAliasView ? (
              <InfoTile
                icon={<TagIcon className="size-3" />}
                label="Alias of"
                value={canonicalName}
              />
            ) : null}
            {artistTile ? (
              <InfoTile
                icon={<PaletteIcon className="size-3" />}
                label="Artist"
                value={artistTile.artist}
                href={artistTile.href}
              />
            ) : null}
            {uploaderTile ? (
              <InfoTile
                icon={<UserIcon className="size-3" />}
                label="Uploader"
                value={uploaderTile.uploader}
                href={uploaderTile.href}
              />
            ) : null}
          </div>
        ) : null}

        {showActions ? (
          <div className="flex flex-col gap-1.5">
            {showPlatformAction ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="w-full justify-start"
                onClick={() => openExternalUrl(platformUrl)}
              >
                <ExternalLinkIcon className="size-3 shrink-0" />
                View on {platform.label}
              </Button>
            ) : null}
            {showChannelAction && details?.channelUrl ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="w-full justify-start"
                onClick={() => openExternalUrl(details.channelUrl)}
              >
                <ExternalLinkIcon className="size-3 shrink-0" />
                View channel
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
