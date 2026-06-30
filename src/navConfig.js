import {
  Home, Layers, BookOpen, Dumbbell, GraduationCap,
  User, Settings, Globe, LogOut,
} from 'lucide-react'

// Single source of truth for navigation, consumed by both Sidebar (desktop) and
// MobileNav (mobile) so the two can't drift. Individual study/practice modes are
// reached through the Practice hub, not the top-level nav, to keep it calm.

// Desktop sidebar — primary section (the daily loop + the goal gate).
export const PRIMARY_NAV = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Flashcards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'practice', label: 'Practice', icon: Dumbbell },
  { key: 'test', label: 'Test', icon: GraduationCap },
]

// Desktop sidebar — bottom section (account).
export const BOTTOM_NAV = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'logout', label: 'Log out', icon: LogOut },
]

// Mobile bottom bar — 4 tabs + a "More" sheet.
export const MOBILE_PRIMARY = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'study', label: 'Cards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'practice', label: 'Practice', icon: Dumbbell },
]

export const MOBILE_MORE = [
  { key: 'test', label: 'Test', icon: GraduationCap },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'logout', label: 'Log out', icon: LogOut },
]
