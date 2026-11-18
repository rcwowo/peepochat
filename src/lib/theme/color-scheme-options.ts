import type { ColorScheme } from "@/components/shell/theme-provider"

export const COLOR_SCHEME_OPTIONS: {
  value: ColorScheme
  label: string
  color: string
}[] = [
  { value: "gray", label: "Gray", color: "#737373" },
  { value: "red", label: "Red", color: "#ef4444" },
  { value: "orange", label: "Orange", color: "#f97316" },
  { value: "yellow", label: "Yellow", color: "#eab308" },
  { value: "green", label: "Green", color: "#22c55e" },
  { value: "blue", label: "Blue", color: "#3b82f6" },
  { value: "purple", label: "Purple", color: "#a855f7" },
  { value: "pink", label: "Pink", color: "#ec4899" },
]
