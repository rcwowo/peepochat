import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"

const timestamp24HourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const timestamp12HourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

export function formatMessageTimestamp(
  value: string,
  format: MessageTimestampFormat
) {
  if (format === "none") {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  if (format === "24-hour") {
    return timestamp24HourFormatter.format(date)
  }

  if (format === "12-hour-meridiem") {
    return timestamp12HourFormatter.format(date)
  }

  return timestamp12HourFormatter
    .formatToParts(date)
    .flatMap((part) => (part.type !== "dayPeriod" ? [part.value] : []))
    .join("")
    .trim()
}
