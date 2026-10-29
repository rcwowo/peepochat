import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

const JUMP_REQUEST_TTL_MS = 3000

export type ChatMessageJumpRequest = {
  id: number
  channelLogin: string
  messageId: string
  requestedAt: number
}

let nextRequestId = 1
let pendingRequest: ChatMessageJumpRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function requestChatMessageJump(
  channelLogin: string,
  messageId: string
) {
  pendingRequest = {
    id: nextRequestId++,
    channelLogin: normalizeChannelLogin(channelLogin),
    messageId,
    requestedAt: Date.now(),
  }
  emit()
}

export function subscribeToChatMessageJumps(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function takeChatMessageJump(
  channelLogin: string
): ChatMessageJumpRequest | null {
  const request = pendingRequest
  if (!request) {
    return null
  }

  if (Date.now() - request.requestedAt > JUMP_REQUEST_TTL_MS) {
    pendingRequest = null
    return null
  }

  if (request.channelLogin !== normalizeChannelLogin(channelLogin)) {
    return null
  }

  pendingRequest = null
  return request
}
