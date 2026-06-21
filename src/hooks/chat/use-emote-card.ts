import * as React from "react"

import type { ComposerEmoteCatalog } from "@/lib/chat/chat-emote-catalog"
import { loadEmoteCardDetails } from "@/lib/chat/emote-card-details"
import {
  buildInitialEmoteCardDetails,
  lookupEmoteCatalogEntry,
  type EmoteCardDetails,
  type EmoteCardTarget,
} from "@/lib/chat/emote-card"

type EmoteCardState =
  | { status: "idle"; details: null; error: null }
  | { status: "loading"; details: EmoteCardDetails | null; error: null }
  | { status: "ready"; details: EmoteCardDetails; error: null }
  | { status: "error"; details: EmoteCardDetails | null; error: string }

export function useEmoteCard({
  open,
  target,
  catalog,
}: {
  open: boolean
  target: EmoteCardTarget | null
  catalog: ComposerEmoteCatalog | null
}) {
  const [state, setState] = React.useState<EmoteCardState>({
    status: "idle",
    details: null,
    error: null,
  })
  const requestIdRef = React.useRef(0)

  const catalogEntry = React.useMemo(() => {
    if (!catalog || !target) {
      return null
    }
    return lookupEmoteCatalogEntry(catalog, target)
  }, [catalog, target])

  const reload = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!open || !target) {
      setState({ status: "idle", details: null, error: null })
      return
    }

    const fallback = buildInitialEmoteCardDetails(target, catalogEntry)

    setState({
      status: "loading",
      details: fallback,
      error: null,
    })

    try {
      const details = await loadEmoteCardDetails({
        target,
        catalogEntry,
      })

      if (requestIdRef.current !== requestId) {
        return
      }

      setState({ status: "ready", details, error: null })
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return
      }

      setState({
        status: "error",
        details: fallback,
        error:
          error instanceof Error ? error.message : "Could not load emote details.",
      })
    }
  }, [catalogEntry, open, target])

  React.useEffect(() => {
    if (!open || !target) {
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const fallback = buildInitialEmoteCardDetails(target, catalogEntry)

    queueMicrotask(() => {
      if (requestIdRef.current !== requestId) {
        return
      }

      setState({
        status: "loading",
        details: fallback,
        error: null,
      })
    })

    void loadEmoteCardDetails({
      target,
      catalogEntry,
    })
      .then((details) => {
        if (requestIdRef.current !== requestId) {
          return
        }

        setState({ status: "ready", details, error: null })
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) {
          return
        }

        setState({
          status: "error",
          details: fallback,
          error:
            error instanceof Error ? error.message : "Could not load emote details.",
        })
      })
  }, [catalogEntry, open, target])

  return { ...state, reload }
}
