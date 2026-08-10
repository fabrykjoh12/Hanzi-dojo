import { createContext, useContext } from 'react'

// The Stories tab's shared data, as a context handle.
//
// Split from the provider component because CLAUDE.md §3 keeps `.jsx` for
// components only — and react-refresh needs it: a file that exports both a
// component and a hook loses fast refresh for the whole module.
//
// One key for "the shelf's data", scoped per user and language by dataCache.
export const STORIES_CACHE_KEY = 'stories:shelf'

export const StoriesDataContext = createContext(null)

export function useStoriesData() {
  const ctx = useContext(StoriesDataContext)
  if (!ctx) throw new Error('useStoriesData outside StoriesDataProvider')
  return ctx
}
