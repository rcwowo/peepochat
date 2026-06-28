const PORTALED_LAYER_SELECTOR =
  '[data-slot="select-content"], [data-slot="dropdown-menu-content"], [data-slot="popover-content"]'

const OPEN_PORTALED_LAYER_SELECTOR =
  '[data-slot="select-content"][data-state="open"], [data-slot="select-trigger"][data-state="open"], [data-slot="dropdown-menu-content"][data-state="open"], [data-slot="dropdown-menu-trigger"][data-state="open"], [data-slot="popover-content"][data-state="open"], [data-slot="popover-trigger"][data-state="open"]'

let portaledLayerOpenAtPointerDown = false

export function isSettingsPortaledLayerOpen() {
  return Boolean(document.querySelector(OPEN_PORTALED_LAYER_SELECTOR))
}

export function shouldPreventSettingsDismiss(target: EventTarget | null) {
  if (portaledLayerOpenAtPointerDown) {
    return true
  }

  if (target instanceof Element && target.closest(PORTALED_LAYER_SELECTOR)) {
    return true
  }

  return isSettingsPortaledLayerOpen()
}

export function installSettingsPortaledLayerPointerGuard() {
  const onPointerDownCapture = () => {
    portaledLayerOpenAtPointerDown = isSettingsPortaledLayerOpen()
  }

  document.addEventListener("pointerdown", onPointerDownCapture, true)

  return () => {
    document.removeEventListener("pointerdown", onPointerDownCapture, true)
    portaledLayerOpenAtPointerDown = false
  }
}
