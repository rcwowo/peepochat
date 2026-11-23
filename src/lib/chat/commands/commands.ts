import { CHAT_COMMAND_SCOPES } from "@/lib/chat/commands/scopes"
import {
  ANNOUNCEMENT_COLOR_SET,
  KNOWN_CHAT_COMMANDS,
} from "@/lib/chat/commands/definitions"
import {
  looksLikeDuration,
  parseFollowersDuration,
  parseSlowModeWaitTime,
  parseTimeoutDuration,
} from "@/lib/chat/commands/durations"
import {
  parseSlashCommand,
  splitFirstToken,
  type ParsedSlashCommand,
} from "@/lib/chat/commands/parse"
import {
  createUserCardTargetFromTwitchUser,
  type UserCardTarget,
} from "@/lib/chat/user-card/user-card"
import type { TwitchSelfChatState } from "@/lib/twitch/chat/types"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { fetchIvrTwitchModVip, IvrApiError } from "@/lib/ivr/ivr-api"
import {
  banTwitchUser,
  cancelTwitchRaid,
  clearTwitchChat,
  createTwitchStreamMarker,
  fetchTwitchUsersByLogin,
  sendTwitchChatAnnouncement,
  sendTwitchShoutout,
  setTwitchModeratorStatus,
  setTwitchVipStatus,
  startTwitchCommercial,
  startTwitchRaid,
  TwitchApiError,
  unbanTwitchUser,
  updateTwitchChatSettings,
} from "@/lib/twitch/auth/api"

const DEFAULT_TIMEOUT_SECONDS = 10 * 60
const DEFAULT_COMMERCIAL_SECONDS = 30
const DEFAULT_SLOW_SECONDS = 30

export type ChatCommandResult =
  | {
      handled: true
      kind: "feedback"
      message: string
      level?: "info" | "error"
    }
  | { handled: true; kind: "me"; text: string }
  | { handled: true; kind: "open_user_card"; target: UserCardTarget }
  | { handled: false }

export type ChatCommandContext = {
  account: TwitchAccount | null
  channelLogin: string
  broadcasterId: string | null
  selfState: TwitchSelfChatState | null
  blockUser?: (userId: string, login: string) => Promise<void>
  unblockUser?: (userId: string, login: string) => Promise<void>
}

function hasScope(account: TwitchAccount | null, scope: string): boolean {
  return Boolean(account?.scopes?.includes(scope))
}

function missingScopeMessage(scope: string): string {
  return `Missing permission (${scope}). Sign out and sign back in to grant updated scopes.`
}

function actorIsBroadcaster(
  account: TwitchAccount,
  broadcasterId: string | null
): boolean {
  return Boolean(broadcasterId && account.id === broadcasterId)
}

function actorCanModerate(
  account: TwitchAccount,
  broadcasterId: string | null,
  selfState: TwitchSelfChatState | null
): boolean {
  return (
    actorIsBroadcaster(account, broadcasterId) ||
    Boolean(selfState?.isModerator)
  )
}

function requireAccount(
  account: TwitchAccount | null
): TwitchAccount | ChatCommandResult {
  if (!account) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: "Sign in with Twitch to use chat commands.",
    }
  }
  return account
}

function requireBroadcasterId(
  broadcasterId: string | null
): string | ChatCommandResult {
  if (!broadcasterId) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: "Channel information is not available yet.",
    }
  }
  return broadcasterId
}

function requireLogin(login: string): string | ChatCommandResult {
  const normalized = login.replace(/^@/, "").trim()
  if (!normalized) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: "A username is required.",
    }
  }
  return normalized
}

async function resolveLogin(
  login: string,
  account: TwitchAccount
): Promise<string | ChatCommandResult> {
  const normalized = requireLogin(login)
  if (typeof normalized !== "string") {
    return normalized
  }

  const users = await fetchTwitchUsersByLogin(
    [normalized],
    account.accessToken,
    account.clientId
  )
  const user = users[0]
  if (!user) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: `User "${normalized}" was not found.`,
    }
  }

  return user.id
}

function parseOptionalPositiveInt(
  value: string | undefined,
  fallback: number
): number | ChatCommandResult {
  if (!value) {
    return fallback
  }

  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: `"${value}" is not a valid number.`,
    }
  }

  return parsed
}

function formatUserList(
  label: string,
  users: Array<{ login: string }>
): string {
  if (users.length === 0) {
    return `${label}: (none)`
  }

  return `${label}: ${users.map((user) => user.login).join(", ")}`
}

async function runModVipListCommand(
  commandName: "mods" | "vips",
  channelLogin: string
): Promise<ChatCommandResult> {
  const modVip = await fetchIvrTwitchModVip(channelLogin)
  const users = commandName === "mods" ? modVip.mods : modVip.vips

  return {
    handled: true,
    kind: "feedback",
    message: formatUserList(
      commandName === "mods" ? "Moderators" : "VIPs",
      users
    ),
  }
}

async function runCommand(
  command: ParsedSlashCommand,
  context: ChatCommandContext
): Promise<ChatCommandResult> {
  const accountResult = requireAccount(context.account)
  if (!("accessToken" in accountResult)) {
    return accountResult
  }
  const account = accountResult

  if (command.name === "mods" || command.name === "vips") {
    return runModVipListCommand(command.name, context.channelLogin)
  }

  if (command.name === "user") {
    const [login] = splitFirstToken(command.rawArgs)
    if (!login) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: "Usage: /user <username>",
      }
    }

    const normalizedLogin = requireLogin(login)
    if (typeof normalizedLogin !== "string") {
      return normalizedLogin
    }

    const users = await fetchTwitchUsersByLogin(
      [normalizedLogin],
      account.accessToken,
      account.clientId
    )
    const user = users[0]
    if (!user) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: `User "${normalizedLogin}" was not found.`,
      }
    }

    return {
      handled: true,
      kind: "open_user_card",
      target: createUserCardTargetFromTwitchUser(user, context.channelLogin),
    }
  }

  if (command.name === "block" || command.name === "unblock") {
    if (!hasScope(account, CHAT_COMMAND_SCOPES.blockedUsersManage)) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: missingScopeMessage(CHAT_COMMAND_SCOPES.blockedUsersManage),
      }
    }

    const [login] = splitFirstToken(command.rawArgs)
    if (!login) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: `Usage: /${command.name} <username>`,
      }
    }

    const normalizedLogin = requireLogin(login)
    if (typeof normalizedLogin !== "string") {
      return normalizedLogin
    }

    const users = await fetchTwitchUsersByLogin(
      [normalizedLogin],
      account.accessToken,
      account.clientId
    )
    const user = users[0]
    if (!user) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: `User "${normalizedLogin}" was not found.`,
      }
    }

    if (user.id === account.id) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: "You cannot block yourself.",
      }
    }

    if (command.name === "block") {
      if (!context.blockUser) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Blocking is not available right now.",
        }
      }

      await context.blockUser(user.id, user.login)
      return {
        handled: true,
        kind: "feedback",
        message: `Blocked ${user.login}.`,
      }
    }

    if (!context.unblockUser) {
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: "Unblocking is not available right now.",
      }
    }

    await context.unblockUser(user.id, user.login)
    return {
      handled: true,
      kind: "feedback",
      message: `Unblocked ${user.login}.`,
    }
  }

  const broadcasterResult = requireBroadcasterId(context.broadcasterId)
  if (typeof broadcasterResult !== "string") {
    return broadcasterResult
  }
  const broadcasterId = broadcasterResult

  const moderatorId = account.id
  const auth = {
    accessToken: account.accessToken,
    clientId: account.clientId,
  }

  switch (command.name) {
    case "me": {
      if (!command.rawArgs) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Usage: /me <action>",
        }
      }
      return { handled: true, kind: "me", text: command.rawArgs }
    }

    case "announce": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to send announcements.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.announcements)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.announcements),
        }
      }
      if (!command.rawArgs) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Usage: /announce [color] <message>",
        }
      }

      let color: string | undefined
      let message = command.rawArgs
      const [firstToken, rest] = splitFirstToken(command.rawArgs)
      if (ANNOUNCEMENT_COLOR_SET.has(firstToken.toLowerCase())) {
        if (!rest) {
          return {
            handled: true,
            kind: "feedback",
            level: "error",
            message: "Usage: /announce [color] <message>",
          }
        }
        color = firstToken.toLowerCase()
        message = rest
      }

      await sendTwitchChatAnnouncement({
        broadcasterId,
        moderatorId,
        message,
        color,
        ...auth,
      })
      return { handled: true, kind: "feedback", message: "Announcement sent." }
    }

    case "ban":
    case "timeout": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to use this command.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.bannedUsers)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.bannedUsers),
        }
      }

      const [login, reasonAndDuration] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message:
            command.name === "ban"
              ? "Usage: /ban <username> [reason]"
              : "Usage: /timeout <username> [duration] [reason]",
        }
      }

      const loginResult = requireLogin(login)
      if (typeof loginResult !== "string") {
        return loginResult
      }

      let durationSeconds: number | undefined
      let reason = reasonAndDuration
      if (command.name === "timeout" && reasonAndDuration) {
        const [durationToken, rest] = splitFirstToken(reasonAndDuration)
        if (looksLikeDuration(durationToken)) {
          const duration = parseTimeoutDuration(durationToken)
          if (!duration.ok) {
            return {
              handled: true,
              kind: "feedback",
              level: "error",
              message:
                duration.error === "invalid"
                  ? `"${durationToken}" is not a valid duration. Use seconds or a number with a unit (s, m, h, d, w), e.g. 10m.`
                  : "Timeout duration must be between 1 second and 2 weeks.",
            }
          }
          durationSeconds = duration.value
          reason = rest
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await banTwitchUser({
        broadcasterId,
        moderatorId,
        userId: userIdResult,
        reason: reason || undefined,
        durationSeconds:
          command.name === "timeout"
            ? (durationSeconds ?? DEFAULT_TIMEOUT_SECONDS)
            : undefined,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message:
          command.name === "ban"
            ? `Banned ${login.replace(/^@/, "")}.`
            : `Timed out ${login.replace(/^@/, "")}.`,
      }
    }

    case "untimeout":
    case "unban": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to use this command.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.bannedUsers)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.bannedUsers),
        }
      }

      const [login] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: `Usage: /${command.name} <username>`,
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await unbanTwitchUser({
        broadcasterId,
        moderatorId,
        userId: userIdResult,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message: `Removed timeout/ban for ${login.replace(/^@/, "")}.`,
      }
    }

    case "clear": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to clear chat.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.chatMessages)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.chatMessages),
        }
      }

      await clearTwitchChat({ broadcasterId, moderatorId, ...auth })
      return { handled: true, kind: "feedback", message: "Chat cleared." }
    }

    case "emoteonly":
    case "emoteonlyoff":
    case "followers":
    case "followersoff":
    case "slow":
    case "slowoff":
    case "subscribers":
    case "subscribersoff":
    case "uniquechat":
    case "uniquechatoff": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to update chat settings.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.chatSettings)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.chatSettings),
        }
      }

      const settings: Parameters<
        typeof updateTwitchChatSettings
      >[0]["settings"] = {}

      switch (command.name) {
        case "emoteonly":
          settings.emoteMode = true
          break
        case "emoteonlyoff":
          settings.emoteMode = false
          break
        case "subscribers":
          settings.subscriberMode = true
          break
        case "subscribersoff":
          settings.subscriberMode = false
          break
        case "uniquechat":
          settings.uniqueChatMode = true
          break
        case "uniquechatoff":
          settings.uniqueChatMode = false
          break
        case "followers": {
          settings.followerMode = true
          if (!command.rawArgs) {
            settings.followerModeDuration = 0
            break
          }

          const duration = parseFollowersDuration(command.rawArgs)
          if (!duration.ok) {
            return {
              handled: true,
              kind: "feedback",
              level: "error",
              message:
                duration.error === "invalid"
                  ? `"${command.rawArgs}" is not a valid duration. Use minutes or a number with a unit (m, h, d, w, mo), e.g. 1w.`
                  : "Followers-only duration must be between 0 minutes and 3 months.",
            }
          }
          settings.followerModeDuration = duration.value
          break
        }
        case "followersoff":
          settings.followerMode = false
          break
        case "slow": {
          settings.slowMode = true
          const [secondsToken] = splitFirstToken(command.rawArgs)
          if (!secondsToken) {
            settings.slowModeWaitTime = DEFAULT_SLOW_SECONDS
            break
          }

          const seconds = parseSlowModeWaitTime(secondsToken)
          if (!seconds.ok) {
            return {
              handled: true,
              kind: "feedback",
              level: "error",
              message:
                seconds.error === "invalid"
                  ? `"${secondsToken}" is not a valid number.`
                  : "Slow mode wait time must be between 3 and 120 seconds.",
            }
          }
          settings.slowModeWaitTime = seconds.value
          break
        }
        case "slowoff":
          settings.slowMode = false
          break
      }

      await updateTwitchChatSettings({
        broadcasterId,
        moderatorId,
        settings,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message: `Updated chat setting (${command.name}).`,
      }
    }

    case "commercial": {
      if (!actorIsBroadcaster(account, broadcasterId)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Only the broadcaster can start a commercial.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.commercial)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.commercial),
        }
      }

      const [lengthToken] = splitFirstToken(command.rawArgs)
      const length = parseOptionalPositiveInt(
        lengthToken || undefined,
        DEFAULT_COMMERCIAL_SECONDS
      )
      if (typeof length !== "number") {
        return length
      }

      const result = await startTwitchCommercial({
        broadcasterId,
        length: Math.min(length, 180),
        ...auth,
      })

      const retryMessage =
        result.retryAfter > 0
          ? ` Next commercial available in ${result.retryAfter}s.`
          : ""

      return {
        handled: true,
        kind: "feedback",
        message: `Commercial started (${result.length}s).${retryMessage}`,
      }
    }

    case "marker": {
      if (
        !actorIsBroadcaster(account, broadcasterId) &&
        !actorCanModerate(account, broadcasterId, context.selfState)
      ) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message:
            "You must be the broadcaster or a moderator to add a marker.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.broadcast)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.broadcast),
        }
      }

      const marker = await createTwitchStreamMarker({
        userId: broadcasterId,
        description: command.rawArgs || undefined,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message: `Stream marker created at ${marker.positionSeconds}s.`,
      }
    }

    case "mod":
    case "unmod": {
      if (!actorIsBroadcaster(account, broadcasterId)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Only the broadcaster can manage moderators.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.moderators)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.moderators),
        }
      }

      const [login] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: `Usage: /${command.name} <username>`,
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await setTwitchModeratorStatus({
        broadcasterId,
        userId: userIdResult,
        moderated: command.name === "mod",
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message:
          command.name === "mod"
            ? `Added ${login.replace(/^@/, "")} as a moderator.`
            : `Removed ${login.replace(/^@/, "")} as a moderator.`,
      }
    }

    case "raid": {
      if (!actorIsBroadcaster(account, broadcasterId)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Only the broadcaster can start a raid.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.raids)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.raids),
        }
      }

      const [login] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Usage: /raid <username>",
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await startTwitchRaid({
        fromBroadcasterId: broadcasterId,
        toBroadcasterId: userIdResult,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message: `Raid started to ${login.replace(/^@/, "")}.`,
      }
    }

    case "unraid": {
      if (!actorIsBroadcaster(account, broadcasterId)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Only the broadcaster can cancel a raid.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.raids)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.raids),
        }
      }

      await cancelTwitchRaid({ broadcasterId, ...auth })
      return { handled: true, kind: "feedback", message: "Raid cancelled." }
    }

    case "vip":
    case "unvip": {
      if (!actorIsBroadcaster(account, broadcasterId)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Only the broadcaster can manage VIPs.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.vips)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.vips),
        }
      }

      const [login] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: `Usage: /${command.name} <username>`,
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await setTwitchVipStatus({
        broadcasterId,
        userId: userIdResult,
        isVip: command.name === "vip",
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message:
          command.name === "vip"
            ? `Added ${login.replace(/^@/, "")} as a VIP.`
            : `Removed ${login.replace(/^@/, "")} as a VIP.`,
      }
    }

    case "shoutout":
    case "so": {
      if (!actorCanModerate(account, broadcasterId, context.selfState)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "You must be a moderator to send a shoutout.",
        }
      }
      if (!hasScope(account, CHAT_COMMAND_SCOPES.shoutouts)) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: missingScopeMessage(CHAT_COMMAND_SCOPES.shoutouts),
        }
      }

      const [login] = splitFirstToken(command.rawArgs)
      if (!login) {
        return {
          handled: true,
          kind: "feedback",
          level: "error",
          message: "Usage: /shoutout <username>",
        }
      }

      const userIdResult = await resolveLogin(login, account)
      if (typeof userIdResult !== "string") {
        return userIdResult
      }

      await sendTwitchShoutout({
        fromBroadcasterId: broadcasterId,
        toBroadcasterId: userIdResult,
        moderatorId,
        ...auth,
      })

      return {
        handled: true,
        kind: "feedback",
        message: `Shoutout sent to ${login.replace(/^@/, "")}.`,
      }
    }

    default:
      return {
        handled: true,
        kind: "feedback",
        level: "error",
        message: `Unknown command: /${command.name}`,
      }
  }
}

export async function executeChatCommand(
  input: string,
  context: ChatCommandContext
): Promise<ChatCommandResult> {
  const parsed = parseSlashCommand(input)
  if (!parsed) {
    return { handled: false }
  }

  if (!KNOWN_CHAT_COMMANDS.has(parsed.name)) {
    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message: `Unknown command: /${parsed.name}`,
    }
  }

  try {
    return await runCommand(parsed, context)
  } catch (error) {
    const message =
      error instanceof TwitchApiError || error instanceof IvrApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Command failed."

    return {
      handled: true,
      kind: "feedback",
      level: "error",
      message,
    }
  }
}
