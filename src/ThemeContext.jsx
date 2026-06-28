import { createContext, useContext } from 'react'

// Theme is owned by App (so it can persist to the profile and react to login).
// Components read it through this context.
export const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
