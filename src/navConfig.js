import {
  Home, Layers, BookOpen, Target, ClipboardCheck,
  Settings, Globe, BarChart3, PanelsTopLeft,
} from 'lucide-react'

// Single source of truth for navigation, consumed by both Sidebar (desktop) and
// MobileNav (mobile) so the two can't drift. Individual study/practice modes are
// reached through the Practice hub, not the top-level nav, to keep it calm.

// Desktop sidebar — primary section (the daily loop + the goal gate). Same
// destination names as the phone's dock: the root of the app is Today.
export const PRIMARY_NAV = [
  { key: 'home', label: 'Today', icon: Home },
  { key: 'study', label: 'Flashcards', icon: Layers },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'practice', label: 'Practice', icon: Target },
  { key: 'test', label: 'Test', icon: ClipboardCheck },
]

// The sidebar breaks PRIMARY_NAV into two clusters separated by a gap: the
// first three are the daily loop (cards, then reading), the last two are what
// you reach for deliberately.
//
// These carried printed headings ("DAILY LOOP" / "TRAIN") for one iteration.
// Five links do not need a taxonomy — the labels were inventing structure to
// look organised, which is the exact thing that makes an interface feel
// generated. The gap alone says it, so the ids stay and the words go.
export const NAV_GROUPS = [
  { keys: ['home', 'study', 'stories'] },
  { keys: ['practice', 'test'] },
]

// The desktop sidebar used to render a matching BOTTOM_NAV here — Profile,
// Settings, Language, Log out as four more full-width rows. Its footer now
// builds those itself (an avatar row plus three icon buttons) and the language
// gets its own identity card, so the array had no remaining reader.

// Mobile navigation is the product architecture: Stories — Today — Practice.
//
// The middle destination is keyed `home` because that is its route (`/`) and
// every caller in the app navigates to it by that name; the LABEL is Today,
// because that is what the screen is — the learner's current task, not a
// dashboard you return to. Renaming the key would rewrite routing for a word.
// Cards start from Today; account destinations live inside Profile.
export const MOBILE_PRIMARY = [
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'home', label: 'Today', icon: Home },
  { key: 'practice', label: 'Practice', icon: Target },
]

export const PROFILE_NAV = [
  { key: 'test', label: 'Test', icon: ClipboardCheck },
  { key: 'languages', label: 'Language', icon: Globe },
  { key: 'settings', label: 'Settings', icon: Settings },
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

// Dojo HQ is stripped from the public/store bundle at build time (App.jsx
// guards its import on Vite's __DOJO_INTERNAL_BUILD__ define), where /hq is a
// 404 for everyone — admins included. Its nav entry has to disappear with it,
// or an admin opening the store app gets a menu row that leads nowhere.
//
// Pure and parameterised rather than reading the build flag here, so the rule
// is testable and navConfig stays free of build-time globals. Callers pass
// whether the HQ module is actually present.
export function adminNav(hasInternalTooling) {
  return ADMIN_NAV.filter(item => item.key !== 'hq' || hasInternalTooling)
}
