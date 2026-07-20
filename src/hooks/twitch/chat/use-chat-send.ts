import * as React from "react"

import { useLazyRef } from "@/hooks/use-lazy-ref"
import {
  executeChatCommand,
  type ChatCommandContext,
  type ChatCommandResult,
} from "@/lib/chat/chat-commands"
import {
  createChatRateLimiter,
  isPrivilegedChannelSender,
  mapRateLimitResult,
  type ChatSendResult,
  type TwitchChannelSendBlock,
} from "@/lib/chat/chat-send"
import {
  classifySendNotice,
  isSendRejectionNotice,
  type SendOutcomeEvent,
} from "@/lib/chat/chat-send-notice"
import { createRecentMessagesStatusMessage } from "@/lib/chat/recent-messages"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchChatClient,
  TwitchChatReply,
  TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import type {
  TwitchChatEmoteLoadContext,
  TwitchChatRoomState,
  TwitchSelfChatState,
} from "@/lib/twitch/twitch-chat-types"

type UseChatSendOptions = {
  getSendClient: () => TwitchChatClient
  sendClientRef: React.MutableRefObject<TwitchChatClient | null>
  syncedChannelsRef: React.MutableRefObject<string[]>
  emoteLoadContextRef: React.MutableRefObject<TwitchChatEmoteLoadContext>
  selfStatesRef: React.MutableRefObject<Map<string, TwitchSelfChatState>>
  roomsRef: React.MutableRefObject<Record<string, TwitchChatRoomState>>
  appendRoomSystemMessage: (login: string, message: TwitchSystemMessage) => void
}

export function useChatSend({
  getSendClient,
  sendClientRef,
  syncedChannelsRef,
  emoteLoadContextRef,
  selfStatesRef,
  roomsRef,
  appendRoomSystemMessage,
}: UseChatSendOptions) {
  const rateLimiterRef = useLazyRef(() => createChatRateLimiter())
  const pendingSendRef = React.useRef<{
    channel: string
    recordedAt: number
  } | null>(null)
  const sendBlockTimersRef = useLazyRef(
    () => new Map<string, ReturnType<typeof setTimeout>>()
  )
  const channelSendBlocksRef = React.useRef<
    Record<string, TwitchChannelSendBlock>
  >({})
  const sendOutcomeListenersRef = useLazyRef(
    () => new Set<(event: SendOutcomeEvent) => void>()
  )
  const chatCommandActionsRef = React.useRef<
    Pick<ChatCommandContext, "blockUser" | "unblockUser">
  >({})
  const [channelSendBlocks, setChannelSendBlocks] = React.useState<
    Record<string, TwitchChannelSendBlock>
  >({})

  React.useEffect(() => {
    channelSendBlocksRef.current = channelSendBlocks
  }, [channelSendBlocks])

  const emitSendOutcome = React.useCallback(
    (event: SendOutcomeEvent) => {
      for (const listener of sendOutcomeListenersRef.current) {
        listener(event)
      }
    },
    [sendOutcomeListenersRef]
  )

  const registerSendOutcomeListener = React.useCallback(
    (listener: (event: SendOutcomeEvent) => void) => {
      sendOutcomeListenersRef.current.add(listener)
      return () => {
        sendOutcomeListenersRef.current.delete(listener)
      }
    },
    [sendOutcomeListenersRef]
  )

  const clearSendBlockTimer = React.useCallback(
    (login: string) => {
      const timer = sendBlockTimersRef.current.get(login)
      if (timer) {
        clearTimeout(timer)
        sendBlockTimersRef.current.delete(login)
      }
    },
    [sendBlockTimersRef]
  )

  const scheduleSendBlockClear = React.useCallback(
    (login: string, expiresAt: number) => {
      clearSendBlockTimer(login)
      const delay = Math.max(0, expiresAt - Date.now())
      const timer = setTimeout(() => {
        sendBlockTimersRef.current.delete(login)
        setChannelSendBlocks((current) => {
          const block = current[login]
          if (!block || block.expiresAt !== expiresAt) {
            return current
          }
          const next = { ...current }
          delete next[login]
          return next
        })
      }, delay)
      sendBlockTimersRef.current.set(login, timer)
    },
    [clearSendBlockTimer, sendBlockTimersRef]
  )

  const clearAllSendBlocks = React.useCallback(() => {
    for (const login of sendBlockTimersRef.current.keys()) {
      clearSendBlockTimer(login)
    }
    channelSendBlocksRef.current = {}
    setChannelSendBlocks({})
    pendingSendRef.current = null
  }, [
    clearSendBlockTimer,
    channelSendBlocksRef,
    pendingSendRef,
    sendBlockTimersRef,
  ])

  const handleSendSystemNotice = React.useCallback(
    (message: TwitchSystemMessage) => {
      const login = message.channel
        ? normalizeChannelLogin(message.channel)
        : null
      if (!login || !syncedChannelsRef.current.includes(login)) {
        return
      }

      const sendBlock = classifySendNotice(message)
      if (sendBlock) {
        setChannelSendBlocks((current) => ({
          ...current,
          [login]: sendBlock,
        }))
        if (sendBlock.expiresAt) {
          scheduleSendBlockClear(login, sendBlock.expiresAt)
        } else {
          clearSendBlockTimer(login)
        }
      }

      if (!isSendRejectionNotice(message)) {
        return
      }

      const pending = pendingSendRef.current
      if (
        pending &&
        pending.channel === login &&
        Date.now() - pending.recordedAt < 5_000
      ) {
        rateLimiterRef.current.unrecordLast(login)
        pendingSendRef.current = null
      }

      emitSendOutcome({
        type: "rejected",
        channel: login,
        message: message.text,
      })
    },
    [
      clearSendBlockTimer,
      emitSendOutcome,
      pendingSendRef,
      rateLimiterRef,
      scheduleSendBlockClear,
      syncedChannelsRef,
    ]
  )

  const clearChannelSendBlock = React.useCallback(
    (login: string) => {
      clearSendBlockTimer(login)
      setChannelSendBlocks((current) => {
        if (!current[login]) {
          return current
        }
        const next = { ...current }
        delete next[login]
        return next
      })
    },
    [clearSendBlockTimer]
  )

  const probeSendRestrictions = React.useCallback(() => {
    if (syncedChannelsRef.current.length === 0) {
      return
    }

    sendClientRef.current?.probeSendStatus(syncedChannelsRef.current)
  }, [sendClientRef, syncedChannelsRef])

  const sendChatMessageInternal = React.useCallback(
    (
      login: string,
      message: string,
      reply: TwitchChatReply | null,
      options: { isAction?: boolean } = {}
    ): ChatSendResult => {
      const normalized = normalizeChannelLogin(login)
      const text = message.replace(/\r?\n/g, " ").trim()
      if (!text) {
        return { ok: false, reason: "empty" }
      }

      if (!sendClientRef.current?.isConnected) {
        return { ok: false, reason: "not_connected" }
      }

      const sendBlock = channelSendBlocksRef.current[normalized]
      if (sendBlock) {
        if (
          sendBlock.kind === "ban" ||
          !sendBlock.expiresAt ||
          sendBlock.expiresAt > Date.now()
        ) {
          return {
            ok: false,
            reason: "blocked",
            message: sendBlock.message,
          }
        }
      }

      const { userLogin } = emoteLoadContextRef.current
      const selfState = selfStatesRef.current.get(normalized) ?? null
      const isPrivileged = isPrivilegedChannelSender(
        normalized,
        userLogin ?? null,
        selfState
      )

      const rateLimitResult = rateLimiterRef.current.check(
        normalized,
        isPrivileged
      )
      const rateLimitReason = mapRateLimitResult(rateLimitResult)
      if (rateLimitReason) {
        return { ok: false, reason: rateLimitReason }
      }

      const sent = getSendClient().sendMessage(normalized, text, {
        replyParentMessageId: reply?.parentMessageId ?? null,
        isAction: options.isAction ?? false,
      })
      if (!sent) {
        return { ok: false, reason: "not_connected" }
      }

      rateLimiterRef.current.record(normalized)
      pendingSendRef.current = {
        channel: normalized,
        recordedAt: Date.now(),
      }
      return { ok: true }
    },
    [
      channelSendBlocksRef,
      emoteLoadContextRef,
      getSendClient,
      pendingSendRef,
      rateLimiterRef,
      selfStatesRef,
      sendClientRef,
    ]
  )

  const getChannelSendBlock = React.useCallback(
    (login: string): TwitchChannelSendBlock | null => {
      const normalized = normalizeChannelLogin(login)
      const block = channelSendBlocks[normalized]
      if (!block) {
        return null
      }

      if (
        block.kind === "timeout" &&
        block.expiresAt &&
        block.expiresAt <= Date.now()
      ) {
        return null
      }

      return block
    },
    [channelSendBlocks]
  )

  const sendMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: TwitchChatReply | null = null
    ): ChatSendResult => sendChatMessageInternal(login, message, reply),
    [sendChatMessageInternal]
  )

  const sendActionMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: TwitchChatReply | null = null
    ): ChatSendResult =>
      sendChatMessageInternal(login, message, reply, { isAction: true }),
    [sendChatMessageInternal]
  )

  const setChatCommandActions = React.useCallback(
    (actions: Pick<ChatCommandContext, "blockUser" | "unblockUser">) => {
      chatCommandActionsRef.current = actions
    },
    []
  )

  const runChatCommand = React.useCallback(
    async (
      login: string,
      input: string,
      account: TwitchAccount | null
    ): Promise<ChatCommandResult> => {
      const normalized = normalizeChannelLogin(login)
      const room = roomsRef.current[normalized]
      const result = await executeChatCommand(input, {
        account,
        channelLogin: normalized,
        broadcasterId: room?.roomId ?? null,
        selfState: selfStatesRef.current.get(normalized) ?? null,
        ...chatCommandActionsRef.current,
      })

      if (result.handled && result.kind === "feedback") {
        appendRoomSystemMessage(normalized, {
          ...createRecentMessagesStatusMessage(normalized, result.message),
          level: result.level ?? "info",
        })
      }

      return result
    },
    [appendRoomSystemMessage, chatCommandActionsRef, roomsRef, selfStatesRef]
  )

  const resetRateLimiter = React.useCallback(() => {
    rateLimiterRef.current.reset()
  }, [rateLimiterRef])

  return {
    pendingSendRef,
    emitSendOutcome,
    registerSendOutcomeListener,
    clearSendBlockTimer,
    clearChannelSendBlock,
    clearAllSendBlocks,
    handleSendSystemNotice,
    probeSendRestrictions,
    getChannelSendBlock,
    sendMessage,
    sendActionMessage,
    setChatCommandActions,
    runChatCommand,
    resetRateLimiter,
  }
}

export type ChatSendApi = ReturnType<typeof useChatSend>
