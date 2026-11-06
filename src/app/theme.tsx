import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { readStorage, storageKeys, writeStorage } from '@/lib/storage'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const themeModes: readonly ThemeMode[] = ['system', 'light', 'dark']

export const themeModeLabels: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

interface ThemeContextValue {
  mode: ThemeMode
  /** The theme actually on screen. */
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  /** system → light → dark → system */
  cycleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** Reads the stored mode. The inline script in index.html uses the same key and values. */
export function readStoredThemeMode(): ThemeMode {
  const stored = readStorage(storageKeys.theme)
  // Light until someone chooses otherwise (the founders' default, 7 Nov 2026).
  return isThemeMode(stored) ? stored : 'light'
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode)
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    writeStorage(storageKeys.theme, next)
    setModeState(next)
  }, [])

  const cycleMode = useCallback(() => {
    setModeState((current) => {
      const next = themeModes[(themeModes.indexOf(current) + 1) % themeModes.length] ?? 'system'
      writeStorage(storageKeys.theme, next)
      return next
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved: mode === 'system' ? (systemDark ? 'dark' : 'light') : mode,
      setMode,
      cycleMode,
    }),
    [mode, systemDark, setMode, cycleMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
