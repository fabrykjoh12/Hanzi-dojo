import {
  Home, Layers, BookOpen, Dumbbell, GraduationCap,
  User, Settings, Globe, LogOut, BarChart3, PanelsTopLeft,
} from 'lucide-react'

// Single source of truth for navigation, consumed by both Sidebar (desktop) and
// MobileNav (mobile) so the two can't drift. Individual study/practice modes are
// reached through the Practice hub, not the top-level nav, to keep it calm.

// Desktop sidebar — primary section (the daily loop + the goal gate).
export const PRIMARY_NAV = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'hq', label: 'Dojo HQ', icon: PanelsTopLeft },
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
  { key: 'hq', label: 'Dojo HQ', icon: PanelsTopLeft },
  { key: 'test', label: 'Test', icon: GraduationCap },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'logout', label: 'Log out', icon: LogOut },
]

// Admin-only entry — prepended to the bottom nav (Sidebar) / "More" sheet
// (MobileNav) only when profile.is_admin is true. Kept out of the default
// arrays so it never renders for regular users.
export const ADMIN_NAV = { key: 'dashboard', label: 'Dashboard', icon: BarChart3 }
