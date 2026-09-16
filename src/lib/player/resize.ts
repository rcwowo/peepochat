import {
  PLAYER_CHAT_MIN_WIDTH_PX,
  PLAYER_DESKTOP_SIZE_MAX,
  PLAYER_DESKTOP_SIZE_MIN,
} from "@/lib/peepochat/peepochat-config"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getPlayerMaxPercent(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return PLAYER_DESKTOP_SIZE_MAX
  }

  return clamp(
    ((containerWidth - PLAYER_CHAT_MIN_WIDTH_PX) / containerWidth) * 100,
    0,
    PLAYER_DESKTOP_SIZE_MAX
  )
}

export function clampPlayerPercent(percent: number, containerWidth: number) {
  const normalizedPercent = Number.isFinite(percent)
    ? percent
    : PLAYER_DESKTOP_SIZE_MIN
  return clamp(normalizedPercent, 0, getPlayerMaxPercent(containerWidth))
}

export function getPersistedPlayerPercent(
  percent: number,
  containerWidth: number
) {
  const max = Math.floor(getPlayerMaxPercent(containerWidth))
  if (max < PLAYER_DESKTOP_SIZE_MIN) {
    return null
  }

  return clamp(
    Math.round(percent),
    PLAYER_DESKTOP_SIZE_MIN,
    Math.min(PLAYER_DESKTOP_SIZE_MAX, max)
  )
}
