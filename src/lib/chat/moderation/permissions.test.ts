import { describe, expect, test } from "bun:test"

import { CHAT_COMMAND_SCOPES } from "@/lib/chat/commands/scopes"
import {
  actorCanModerate,
  actorIsBroadcasterInChannel,
  canDeleteMessageInChannel,
  canModerateTarget,
  type ModerationTarget,
} from "@/lib/chat/moderation/permissions"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import type { TwitchSelfChatState } from "@/lib/twitch/chat/types"

const ALL_SCOPES = [
  CHAT_COMMAND_SCOPES.bannedUsers,
  CHAT_COMMAND_SCOPES.chatMessages,
]

function account(overrides: Partial<TwitchAccount> = {}): TwitchAccount {
  return {
    id: "100",
    login: "modder",
    displayName: "Modder",
    profileImageUrl: "",
    bannerImageUrl: "",
    accessToken: "token",
    clientId: "client",
    scopes: ALL_SCOPES,
    ...overrides,
  }
}

function selfState(
  overrides: Partial<TwitchSelfChatState> = {}
): TwitchSelfChatState {
  return {
    channel: "streamer",
    roomId: "1",
    displayName: "Modder",
    color: null,
    badges: [],
    isBroadcaster: false,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    ...overrides,
  }
}

const BROADCASTER_ID = "1"
const CHANNEL = "streamer"
const viewer: ModerationTarget = { userId: "200", userName: "viewer" }

function canModerate(
  target: ModerationTarget,
  options: {
    account?: TwitchAccount | null
    broadcasterId?: string | null
    selfState?: TwitchSelfChatState | null
  } = {}
) {
  return canModerateTarget({
    account: options.account === undefined ? account() : options.account,
    broadcasterId:
      options.broadcasterId === undefined
        ? BROADCASTER_ID
        : options.broadcasterId,
    channelLogin: CHANNEL,
    selfState:
      options.selfState === undefined
        ? selfState({ isModerator: true })
        : options.selfState,
    target,
  })
}

describe("actorCanModerate", () => {
  test("requires an account", () => {
    expect(
      actorCanModerate(null, BROADCASTER_ID, selfState({ isModerator: true }))
    ).toBe(false)
  })

  test("recognizes the broadcaster by id, self state or channel login", () => {
    expect(
      actorCanModerate(account({ id: BROADCASTER_ID }), BROADCASTER_ID, null)
    ).toBe(true)
    expect(
      actorCanModerate(account(), null, selfState({ isBroadcaster: true }))
    ).toBe(true)
    expect(
      actorCanModerate(account({ login: "Streamer" }), null, null, "STREAMER")
    ).toBe(true)
  })

  test("allows moderators and rejects regular users and VIPs", () => {
    expect(
      actorCanModerate(
        account(),
        BROADCASTER_ID,
        selfState({ isModerator: true })
      )
    ).toBe(true)
    expect(
      actorCanModerate(account(), BROADCASTER_ID, selfState({ isVip: true }))
    ).toBe(false)
    expect(actorCanModerate(account(), BROADCASTER_ID, null, "elsewhere")).toBe(
      false
    )
  })
})

describe("actorIsBroadcasterInChannel", () => {
  test("matches the same signals as actorCanModerate without moderators", () => {
    expect(
      actorIsBroadcasterInChannel({
        account: account({ login: "streamer" }),
        broadcasterId: null,
        channelLogin: "Streamer",
      })
    ).toBe(true)
    expect(
      actorIsBroadcasterInChannel({
        account: account(),
        broadcasterId: BROADCASTER_ID,
        selfState: selfState({ isModerator: true }),
      })
    ).toBe(false)
    expect(
      actorIsBroadcasterInChannel({
        account: null,
        broadcasterId: BROADCASTER_ID,
        selfState: selfState({ isBroadcaster: true }),
      })
    ).toBe(false)
  })
})

describe("canModerateTarget", () => {
  test("lets moderators act on regular viewers", () => {
    expect(canModerate(viewer)).toBe(true)
  })

  test("requires the banned-users scope", () => {
    expect(
      canModerate(viewer, {
        account: account({ scopes: [CHAT_COMMAND_SCOPES.chatMessages] }),
      })
    ).toBe(false)
  })

  test("requires a known broadcaster id and moderator status", () => {
    expect(canModerate(viewer, { broadcasterId: null })).toBe(false)
    expect(canModerate(viewer, { selfState: selfState() })).toBe(false)
    expect(canModerate(viewer, { account: null })).toBe(false)
  })

  test("never targets yourself, by id or by login", () => {
    expect(canModerate({ userId: "100", userName: "someone" })).toBe(false)
    expect(canModerate({ userId: null, userName: "MODDER" })).toBe(false)
  })

  test("never targets the broadcaster", () => {
    expect(canModerate({ userId: BROADCASTER_ID, userName: "renamed" })).toBe(
      false
    )
    expect(canModerate({ userId: null, userName: "STREAMER" })).toBe(false)
    expect(
      canModerate({ userId: "300", userName: "other", isBroadcaster: true })
    ).toBe(false)
  })

  test("only the broadcaster can act on other moderators", () => {
    const mod: ModerationTarget = {
      userId: "300",
      userName: "othermod",
      isModerator: true,
    }
    expect(canModerate(mod)).toBe(false)
    expect(
      canModerate(mod, {
        account: account({ id: BROADCASTER_ID, login: CHANNEL }),
        selfState: selfState({ isBroadcaster: true }),
      })
    ).toBe(true)
  })
})

describe("canDeleteMessageInChannel", () => {
  test("requires both the chat-messages scope and moderation rights", () => {
    expect(
      canDeleteMessageInChannel({
        account: account(),
        broadcasterId: BROADCASTER_ID,
        selfState: selfState({ isModerator: true }),
      })
    ).toBe(true)
    expect(
      canDeleteMessageInChannel({
        account: account({ scopes: [CHAT_COMMAND_SCOPES.bannedUsers] }),
        broadcasterId: BROADCASTER_ID,
        selfState: selfState({ isModerator: true }),
      })
    ).toBe(false)
    expect(
      canDeleteMessageInChannel({
        account: account(),
        broadcasterId: BROADCASTER_ID,
        selfState: null,
      })
    ).toBe(false)
  })

  test("lets the channel owner delete before self state arrives", () => {
    expect(
      canDeleteMessageInChannel({
        account: account({ login: "Streamer" }),
        broadcasterId: null,
        channelLogin: "streamer",
        selfState: null,
      })
    ).toBe(true)
  })
})
