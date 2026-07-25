import {
  Home, Layers, BookOpen, Swords, ScrollText,
  User, Settings, Globe, LogOut, BarChart3, PanelsTopLeft,
} from 'lucide-react'

// Single source of truth for navigation, consumed by both Sidebar (desktop) and
// MobileNav (mobile) so the two can't drift. Individual study/practice modes are
// reached through the Practice hub, not the top-level nav, to keep it calm.

// Desktop sidebar — primary section (the daily loop + the goal gate).
export const PRIMARY_NAV = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Flashcards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'practice', label: 'Practice', icon: Swords },
  { key: 'test', label: 'Test', icon: ScrollText },
]

// The sidebar renders PRIMARY_NAV in two labelled groups instead of one
// undifferentiated list of five. The split says something true: the first three
// ARE the daily loop the product is built around (cards, then reading), while
// Practice and Test are the things you reach for deliberately.
export const NAV_GROUPS = [
  { label: 'Daily loop', keys: ['home', 'study', 'stories'] },
  { label: 'Train', keys: ['practice', 'test'] },
]

// The desktop sidebar used to render a matching BOTTOM_NAV here — Profile,
// Settings, Language, Log out as four more full-width rows. Its footer now
// builds those itself (an avatar row plus three icon buttons) and the language
// gets its own identity card, so the array had no remaining reader.

// Mobile bottom bar — 4 tabs + a "More" sheet.
export const MOBILE_PRIMARY = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Cards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'practice', label: 'Practice', icon: Swords },
]

export const MOBILE_MORE = [
  { key: 'test', label: 'Test', icon: ScrollText },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'logout', label: 'Log out', icon: LogOut },
]

// Admin-only entries — prepended to the bottom nav (Sidebar) / "More" sheet
// (MobileNav) only when profile.is_admin is true. Kept out of the default
// arrays so they never render for regular users.
//
// Dojo HQ is an INTERNAL collaboration tool (workspaces, invite codes, member
// management). It shipped in PRIMARY_NAV, which put it in front of every
// learner; it belongs here, and App.jsx gates the route itself so typing /hq
// doesn't get around the missing menu entry.
export const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'hq', label: 'Dojo HQ', icon: PanelsTopLeft },
]
