import {
  Home, Layers, BookOpen, Target, ClipboardCheck,
  User, Settings, Globe, LogOut, BarChart3, PanelsTopLeft,
} from 'lucide-react'
import { PracticeIcon, HomeIcon, CardsIcon, StoriesIcon } from './NavIcons'

// Single source of truth for navigation, consumed by both Sidebar (desktop) and
// MobileNav (mobile) so the two can't drift. Individual study/practice modes are
// reached through the Practice hub, not the top-level nav, to keep it calm.

// Desktop sidebar — primary section (the daily loop + the goal gate).
export const PRIMARY_NAV = [
  { key: 'home', label: 'Home', icon: Home },
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

// Mobile bottom bar — 4 tabs + a "More" sheet.
//
// The ORDER is the hierarchy. Cards is the action a learner repeats dozens of
// times a day, so it takes the physical centre of the five columns; Home and
// Stories flank it, so the middle three read left to right as the daily loop
// (open the app → review → read); and Practice and More, the two drawers, sit
// on the outside where the thumb reaches last.
//
// Position is presentation only. Home is still the tab the app launches on and
// still the tab Back climbs to — that lives in navStack.js (`initialNavState`,
// `androidBack`) and does not follow this array.
//
// The icons are the bar's own family (NavIcons.jsx) rather than lucide: two of
// the five had to be drawn by hand — no library has a flashcard, and Practice
// reads as drills rather than a bullseye — and mixing two drawing systems on
// one row of five is where mismatched weight shows.
export const MOBILE_PRIMARY = [
  { key: 'practice', label: 'Practice', icon: PracticeIcon },
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'study', label: 'Cards', icon: CardsIcon },
  { key: 'stories', label: 'Stories', icon: StoriesIcon },
]

// What is left is the account drawer. The level test used to head this list,
// which put the gate on progression between Profile and Log out — and nothing
// on any screen linked to it, so on a phone that WAS its only entrance. It
// belongs to the Practice tab (navStack.js VIEW_CLASS) and Practice now shows
// it, locked state and all; the desktop rail keeps its own slot next to
// Practice, which is the grouping NAV_GROUPS already describes.
export const MOBILE_MORE = [
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
