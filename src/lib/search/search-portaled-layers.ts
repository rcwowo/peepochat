const SEARCH_PORTALED_LAYER_SELECTOR = [
  '[data-slot="user-card-panel"]',
  '[data-slot="emote-card-panel"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="select-content"]',
  '[data-slot="popover-content"]',
].join(", ")

export function shouldPreventSearchDismiss(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest(SEARCH_PORTALED_LAYER_SELECTOR))
}
