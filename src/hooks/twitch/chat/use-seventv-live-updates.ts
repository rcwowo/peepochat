import * as React from "react"

import type { ChatEmotesApi } from "@/hooks/twitch/chat/use-chat-emotes"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import {
  createEmptyComposerCatalog,
  rebuildRoomThirdPartyEmoteBundle,
} from "@/lib/chat/chat-emote-catalog"
import {
  applySevenTvChannelEmoteAdd,
  applySevenTvChannelEmoteRemove,
  applySevenTvChannelEmoteRename,
  getRoomIdsForSevenTvEmoteSet,
  getRoomIdsForSevenTvUser,
  getSevenTvRoomBinding,
  replaceSevenTvChannelEmotesFromSet,
} from "@/lib/chat/chat-emotes"
import {
  getSevenTvEventApi,
  type SevenTvEmoteSetUpdateEvent,
  type SevenTvUserEmoteSetChangeEvent,
} from "@/lib/chat/seventv-event-api"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"

type UseSevenTvLiveUpdatesOptions = {
  roomStore: RoomStore
  emotes: Pick<
    ChatEmotesApi,
    | "applyRoomEmoteBundle"
    | "composerCatalogsRef"
    | "rehydrateRoomTimeline"
    | "roomEmotesSettledRef"
  >
  appendRoomSystemMessage: (login: string, message: TwitchSystemMessage) => void
}

function createLiveUpdateSystemMessage(
  channelLogin: string,
  roomId: string,
  text: string
): TwitchSystemMessage {
  const channel = normalizeChannelLogin(channelLogin)
  return {
    id: `${channel}:7tv-live:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    channel,
    roomId,
    text,
    headline: text,
    details: null,
    receivedAt: new Date().toISOString(),
    event: "status",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
  }
}

function actorLabel(actorName: string) {
  const trimmed = actorName.trim()
  return trimmed || "Someone"
}

export function useSevenTvLiveUpdates({
  roomStore,
  emotes,
  appendRoomSystemMessage,
}: UseSevenTvLiveUpdatesOptions) {
  const { roomsRef } = roomStore
  const {
    applyRoomEmoteBundle,
    composerCatalogsRef,
    rehydrateRoomTimeline,
    roomEmotesSettledRef,
  } = emotes

  const enabledRef = React.useRef(false)
  const subscribedRoomsRef = React.useRef(new Map<string, string>())
  const appendRoomSystemMessageRef = React.useRef(appendRoomSystemMessage)
  const rehydrateRoomTimelineRef = React.useRef(rehydrateRoomTimeline)

  React.useEffect(() => {
    appendRoomSystemMessageRef.current = appendRoomSystemMessage
  }, [appendRoomSystemMessage])

  React.useEffect(() => {
    rehydrateRoomTimelineRef.current = rehydrateRoomTimeline
  }, [rehydrateRoomTimeline])

  const findLoginForRoomId = React.useCallback(
    (roomId: string): string | null => {
      for (const room of Object.values(roomsRef.current)) {
        if (room.roomId === roomId) {
          return room.login
        }
      }
      return null
    },
    [roomsRef]
  )

  const publishRoomCatalog = React.useCallback(
    async (roomId: string) => {
      const login = findLoginForRoomId(roomId)
      if (!login) return

      const existingComposer =
        composerCatalogsRef.current.get(roomId) ?? createEmptyComposerCatalog()

      const bundle = await rebuildRoomThirdPartyEmoteBundle(
        roomId,
        login,
        existingComposer
      )

      applyRoomEmoteBundle(roomId, bundle)
      rehydrateRoomTimelineRef.current(login, roomId)
    },
    [applyRoomEmoteBundle, composerCatalogsRef, findLoginForRoomId]
  )

  const unsubscribeRoom = React.useCallback((roomId: string) => {
    const api = getSevenTvEventApi()
    const signature = subscribedRoomsRef.current.get(roomId)
    if (!signature) return

    const [emoteSetId = "", seventvUserId = "", twitchRoomId = ""] =
      signature.split("\0")
    if (emoteSetId) api.unsubscribeEmoteSet(emoteSetId)
    if (seventvUserId) api.unsubscribeUser(seventvUserId)
    if (twitchRoomId) api.unsubscribeTwitchChannel(twitchRoomId)
    subscribedRoomsRef.current.delete(roomId)
  }, [])

  const subscribeRoom = React.useCallback(
    (roomId: string) => {
      if (!enabledRef.current) return

      // Prefer module-level bindings from the REST fetch so remounts / Strict
      // Mode can resubscribe even if the React settled-set was reset.
      const binding = getSevenTvRoomBinding(roomId)
      if (!binding || (!binding.emoteSetId && !binding.seventvUserId)) {
        if (!roomEmotesSettledRef.current.has(roomId)) {
          return
        }
        unsubscribeRoom(roomId)
        return
      }

      const signature = `${binding.emoteSetId}\0${binding.seventvUserId}\0${roomId}`
      const previous = subscribedRoomsRef.current.get(roomId)
      if (previous === signature) return

      if (previous) {
        unsubscribeRoom(roomId)
      }

      const api = getSevenTvEventApi()
      // Mirror SevenTV/Extension worker.http fetchChannelData subscriptions.
      if (binding.emoteSetId) api.subscribeEmoteSet(binding.emoteSetId)
      if (binding.seventvUserId) api.subscribeUser(binding.seventvUserId)
      api.subscribeTwitchChannel(roomId)
      subscribedRoomsRef.current.set(roomId, signature)
    },
    [roomEmotesSettledRef, unsubscribeRoom]
  )

  const syncSubscribedRooms = React.useCallback(() => {
    const activeRoomIds = new Set<string>()
    for (const room of Object.values(roomsRef.current)) {
      if (!room.roomId) continue
      activeRoomIds.add(room.roomId)
      if (enabledRef.current) {
        subscribeRoom(room.roomId)
      }
    }

    for (const roomId of [...subscribedRoomsRef.current.keys()]) {
      if (!activeRoomIds.has(roomId) || !enabledRef.current) {
        unsubscribeRoom(roomId)
      }
    }

    if (!enabledRef.current || subscribedRoomsRef.current.size === 0) {
      getSevenTvEventApi().disconnect()
    }
  }, [roomsRef, subscribeRoom, unsubscribeRoom])

  const handleEmoteSetUpdate = React.useCallback(
    (event: SevenTvEmoteSetUpdateEvent) => {
      if (!enabledRef.current) return

      const roomIds = getRoomIdsForSevenTvEmoteSet(event.emoteSetId)
      if (roomIds.length === 0) return

      for (const roomId of roomIds) {
        const login = findLoginForRoomId(roomId)
        if (!login) continue

        let changed = false
        const notices: string[] = []

        for (const emote of event.added) {
          const added = applySevenTvChannelEmoteAdd(roomId, emote)
          if (!added) continue
          changed = true
          notices.push(
            `${actorLabel(event.actorName)} added 7TV emote ${added.code}`
          )
        }

        for (const emote of event.removed) {
          const removed = applySevenTvChannelEmoteRemove(roomId, emote.id)
          if (!removed) continue
          changed = true
          notices.push(
            `${actorLabel(event.actorName)} removed 7TV emote ${removed.code}`
          )
        }

        for (const rename of event.renamed) {
          const renamed = applySevenTvChannelEmoteRename(
            roomId,
            rename.id,
            rename.newName
          )
          if (!renamed) continue
          changed = true
          notices.push(
            `${actorLabel(event.actorName)} renamed 7TV emote ${renamed.previous.code} to ${renamed.next.code}`
          )
        }

        if (!changed) continue

        void publishRoomCatalog(roomId).then(() => {
          for (const text of notices) {
            appendRoomSystemMessageRef.current(
              login,
              createLiveUpdateSystemMessage(login, roomId, text)
            )
          }
        })
      }
    },
    [findLoginForRoomId, publishRoomCatalog]
  )

  const handleUserEmoteSetChange = React.useCallback(
    (event: SevenTvUserEmoteSetChangeEvent) => {
      if (!enabledRef.current) return

      const roomIds = getRoomIdsForSevenTvUser(event.userId)
      if (roomIds.length === 0) return

      for (const roomId of roomIds) {
        const binding = getSevenTvRoomBinding(roomId)
        if (
          binding &&
          event.connectionIndex >= 0 &&
          binding.twitchConnectionIndex !== event.connectionIndex
        ) {
          continue
        }

        const login = findLoginForRoomId(roomId)
        if (!login) continue

        void replaceSevenTvChannelEmotesFromSet(roomId, event.emoteSetId)
          .then((result) => {
            if (!result) return null
            subscribeRoom(roomId)
            return publishRoomCatalog(roomId).then(() => result)
          })
          .then((result) => {
            if (!result) return
            appendRoomSystemMessageRef.current(
              login,
              createLiveUpdateSystemMessage(
                login,
                roomId,
                `${actorLabel(event.actorName)} switched 7TV emote set to ${result.setName}`
              )
            )
          })
          .catch(() => {
            // Keep the previous set if the replacement fetch fails.
          })
      }
    },
    [findLoginForRoomId, publishRoomCatalog, subscribeRoom]
  )

  const handleEmoteSetUpdateRef = React.useRef(handleEmoteSetUpdate)
  const handleUserEmoteSetChangeRef = React.useRef(handleUserEmoteSetChange)

  React.useEffect(() => {
    handleEmoteSetUpdateRef.current = handleEmoteSetUpdate
  }, [handleEmoteSetUpdate])

  React.useEffect(() => {
    handleUserEmoteSetChangeRef.current = handleUserEmoteSetChange
  }, [handleUserEmoteSetChange])

  React.useEffect(() => {
    const api = getSevenTvEventApi()
    const subscribedRooms = subscribedRoomsRef.current
    api.setHandlers({
      onEmoteSetUpdate: (event) => handleEmoteSetUpdateRef.current(event),
      onUserEmoteSetChange: (event) =>
        handleUserEmoteSetChangeRef.current(event),
    })

    return () => {
      api.setHandlers({})
      api.disconnect()
      subscribedRooms.clear()
    }
  }, [])

  const setLiveEmoteUpdatesEnabled = React.useCallback(
    (enabled: boolean) => {
      if (enabledRef.current === enabled) {
        if (enabled) {
          syncSubscribedRooms()
        }
        return
      }

      enabledRef.current = enabled
      syncSubscribedRooms()
    },
    [syncSubscribedRooms]
  )

  const notifyRoomEmotesSettled = React.useCallback(
    (roomId: string) => {
      if (!enabledRef.current) return
      subscribeRoom(roomId)
    },
    [subscribeRoom]
  )

  const notifyRoomsRemoved = React.useCallback(
    (roomIds: string[]) => {
      for (const roomId of roomIds) {
        unsubscribeRoom(roomId)
      }
      if (subscribedRoomsRef.current.size === 0) {
        getSevenTvEventApi().disconnect()
      }
    },
    [unsubscribeRoom]
  )

  return {
    setLiveEmoteUpdatesEnabled,
    notifyRoomEmotesSettled,
    notifyRoomsRemoved,
    syncLiveEmoteSubscriptions: syncSubscribedRooms,
  }
}

export type SevenTvLiveUpdatesApi = ReturnType<typeof useSevenTvLiveUpdates>
