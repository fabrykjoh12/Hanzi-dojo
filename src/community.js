// Single source of truth for the community Discord invite, consumed by the
// Settings screen and the landing footer so the two can't drift.
//
// TO GO LIVE: create the server, then Discord → Invite People → Edit invite
// link → set Expire after: Never and Max number of uses: No limit, copy the
// permanent link, and paste it below. The "Join the community" links light up
// everywhere automatically once a real URL is set.

// PLACEHOLDER — replace with the permanent invite, e.g. 'https://discord.gg/hanzidojo'.
export const DISCORD_INVITE_URL = 'https://discord.gg/REPLACE_ME'

// The community links stay hidden until a real invite is set, so we never ship
// a dead link to users. Any real https invite that isn't the placeholder flips
// them on across the app.
export function isDiscordConfigured() {
  return (
    typeof DISCORD_INVITE_URL === 'string' &&
    DISCORD_INVITE_URL.startsWith('https://') &&
    !DISCORD_INVITE_URL.includes('REPLACE_ME')
  )
}
