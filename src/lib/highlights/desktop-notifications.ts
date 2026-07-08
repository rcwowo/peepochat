export type DesktopNotificationPermission =
  | "default"
  | "granted"
  | "denied"
  | "unsupported"

export function getDesktopNotificationPermission(): DesktopNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  if (Notification.permission === "granted") {
    return "granted"
  }

  if (Notification.permission === "denied") {
    return "denied"
  }

  const result = await Notification.requestPermission()
  return result
}

export function canShowDesktopNotifications(): boolean {
  return getDesktopNotificationPermission() === "granted"
}

export function shouldShowDesktopNotification(): boolean {
  if (typeof document === "undefined") {
    return false
  }

  return !document.hasFocus()
}

export function showDesktopNotification(options: {
  title: string
  body: string
  tag?: string
  icon?: string
  onClick?: () => void
}): Notification | null {
  if (!canShowDesktopNotifications()) {
    return null
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      ...(options.icon ? { icon: options.icon } : {}),
    })

    if (options.onClick) {
      notification.onclick = () => {
        window.focus()
        options.onClick?.()
        notification.close()
      }
    }

    return notification
  } catch {
    return null
  }
}
