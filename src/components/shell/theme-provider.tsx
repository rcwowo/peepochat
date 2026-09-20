/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"
export type ColorScheme =
  "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  colorScheme: ColorScheme
  setColorScheme: (colorScheme: ColorScheme) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]
const COLOR_SCHEME_STORAGE_KEY = "colorScheme"
const DEFAULT_COLOR_SCHEME: ColorScheme = "gray"
const COLOR_SCHEME_VALUES: ColorScheme[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

function isColorScheme(value: string | null): value is ColorScheme {
  return value !== null && COLOR_SCHEME_VALUES.includes(value as ColorScheme)
}

function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark"
  }

  return "light"
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = readStoredValue(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })

  const [colorScheme, setColorSchemeState] = React.useState<ColorScheme>(() => {
    const storedColorScheme = readStoredValue(COLOR_SCHEME_STORAGE_KEY)
    return isColorScheme(storedColorScheme)
      ? storedColorScheme
      : DEFAULT_COLOR_SCHEME
  })

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      writeStoredValue(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const setColorScheme = React.useCallback((nextColorScheme: ColorScheme) => {
    writeStoredValue(COLOR_SCHEME_STORAGE_KEY, nextColorScheme)
    setColorSchemeState(nextColorScheme)
  }, [])

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement
      const resolvedTheme =
        nextTheme === "system" ? getSystemTheme() : nextTheme
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)
      root.style.colorScheme = resolvedTheme
      root.dataset.colorScheme = colorScheme

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [colorScheme, disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme("system")
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [theme, applyTheme])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      try {
        if (event.storageArea !== window.localStorage) {
          return
        }
      } catch {
        return
      }

      if (event.key === null || event.key === storageKey) {
        setThemeState(
          event.key !== null && isTheme(event.newValue)
            ? event.newValue
            : defaultTheme
        )
      }

      if (event.key === null || event.key === COLOR_SCHEME_STORAGE_KEY) {
        setColorSchemeState(
          event.key !== null && isColorScheme(event.newValue)
            ? event.newValue
            : DEFAULT_COLOR_SCHEME
        )
      }
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      colorScheme,
      setColorScheme,
    }),
    [theme, setTheme, colorScheme, setColorScheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
