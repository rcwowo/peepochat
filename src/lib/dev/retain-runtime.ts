const slots = new Map<string, unknown>()

export function retainDevRuntime<T>(key: string, create: () => T): T {
  if (!import.meta.env.DEV) {
    return create()
  }

  const hotData = import.meta.hot?.data as Record<string, T> | undefined
  if (hotData) {
    if (hotData[key] === undefined) {
      hotData[key] = create()
    }
    return hotData[key]
  }

  const existing = slots.get(key)
  if (existing !== undefined) {
    return existing as T
  }

  const created = create()
  slots.set(key, created)
  return created
}
