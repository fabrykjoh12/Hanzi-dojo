import { describe, expect, it } from 'vitest'
import {
  HQ_WORKSPACE_ID, boardCopy, boardIdentity, boardSnapshot, hqWorkspace,
  isMissingSetupError, memberDisplayName, memberQueryKind, setupMissingError,
  toMemberRows,
} from './dojoBoard'

describe('the shared admin workspace', () => {
  it('is one constant board with no invite code', () => {
    const workspace = hqWorkspace()
    expect(workspace.id).toBe(HQ_WORKSPACE_ID)
    expect(workspace.name).toBe('Hanzi Dojo HQ')
    // Membership is profiles.is_admin, so there is nothing to hand out.
    expect(workspace.invite_code).toBeNull()
  })
})

describe('reading the member query shape', () => {
  it('tells the workspace lookup from the member list', () => {
    expect(memberQueryKind('role, workspace:dojo_workspaces!inner(id,name)')).toBe('workspace')
    expect(memberQueryKind('user_id,role,joined_at,profile:profiles!fk(display_name)')).toBe('profile')
    expect(memberQueryKind('*')).toBe('plain')
    expect(memberQueryKind(undefined)).toBe('plain')
  })
})

describe('resolving members to real accounts', () => {
  it('prefers a display name, falls back to the email local part only', () => {
    expect(memberDisplayName({ display_name: 'Fabian' })).toBe('Fabian')
    expect(memberDisplayName({ display_name: '   ', email: 'emil@example.com' })).toBe('emil')
    expect(memberDisplayName({})).toBe('Dojo-medlem')
  })

  it('maps admin rows onto the member shape the board reads', () => {
    const members = toMemberRows(
      [
        { user_id: 'admin-b', display_name: 'Emil', role: 'admin' },
        { user_id: 'admin-a', display_name: 'Fabian', role: 'admin' },
      ],
      { currentUserId: 'admin-a', currentUserName: 'Fabian' },
    )

    expect(members.map(member => member.user_id)).toEqual(['admin-a', 'admin-b'])
    expect(members[0].profile.display_name).toBe('Fabian')
    expect(members[0].workspace_id).toBe(HQ_WORKSPACE_ID)
    // No trace of the old seeded identities.
    expect(members.some(member => member.user_id === 'local-user')).toBe(false)
    expect(members.some(member => member.user_id === 'dojo-friend')).toBe(false)
  })

  it('sorts everyone else by name, with the signed-in admin first', () => {
    const members = toMemberRows(
      [
        { user_id: 'c', display_name: 'Åse' },
        { user_id: 'b', display_name: 'Emil' },
        { user_id: 'a', display_name: 'Zoe' },
      ],
      { currentUserId: 'a', currentUserName: 'Zoe' },
    )
    expect(members.map(member => member.display_name)).toEqual(['Zoe', 'Emil', 'Åse'])
  })

  it('always includes the signed-in admin, even before the round trip lands', () => {
    const members = toMemberRows([], { currentUserId: 'me', currentUserName: 'Fabian' })
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ user_id: 'me', profile: { display_name: 'Fabian' } })
  })

  it('drops duplicates and rows without an id', () => {
    const members = toMemberRows([
      { user_id: 'a', display_name: 'Fabian' },
      { user_id: 'a', display_name: 'Fabian igjen' },
      { display_name: 'Ingen id' },
      null,
    ])
    expect(members).toHaveLength(1)
    expect(members[0].display_name).toBe('Fabian')
  })

  it('survives a non-array payload', () => {
    expect(toMemberRows(null)).toEqual([])
    expect(toMemberRows(undefined, {})).toEqual([])
  })
})

describe('who the board thinks you are', () => {
  it('uses the signed-in account, not the device identity', () => {
    const identity = boardIdentity({
      accountBacked: true,
      deviceIdentity: { userId: 'local-user', displayName: 'Fabian (enhet)' },
      userId: 'auth-uid',
      displayName: 'Fabian',
      email: 'fabian@example.com',
    })
    expect(identity).toEqual({ userId: 'auth-uid', displayName: 'Fabian' })
  })

  it('falls back to the email local part, then a neutral label', () => {
    expect(boardIdentity({ accountBacked: true, userId: 'u', email: 'emil@example.com' }).displayName).toBe('emil')
    expect(boardIdentity({ accountBacked: true, userId: 'u' }).displayName).toBe('Deg')
  })

  it('leaves the device identity alone for the local and hosted clients', () => {
    expect(boardIdentity({ deviceIdentity: { userId: 'device-1', displayName: 'Emil' } }))
      .toEqual({ userId: 'device-1', displayName: 'Emil' })
    expect(boardIdentity({})).toEqual({ userId: '', displayName: 'Dojo-medlem' })
  })
})

describe('spotting the missing migration', () => {
  it('recognises a missing table or function', () => {
    expect(isMissingSetupError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true)
    expect(isMissingSetupError({ code: '42P01', message: 'relation does not exist' })).toBe(true)
    expect(isMissingSetupError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(isMissingSetupError({
      message: 'Could not find the function public.dojo_hq_members in the schema cache',
    })).toBe(true)
  })

  it('does not mistake a permission or network failure for missing setup', () => {
    expect(isMissingSetupError(null)).toBe(false)
    expect(isMissingSetupError({ code: '42501', message: 'permission denied for table dojo_items' })).toBe(false)
    expect(isMissingSetupError({ message: 'Failed to fetch' })).toBe(false)
    expect(isMissingSetupError({ code: 'P0001', message: 'not authorized' })).toBe(false)
  })

  it('normalises to the code the board already switches on', () => {
    // DojoHQ.jsx shows its calm setup screen for 42P01 / PGRST205.
    expect(setupMissingError().code).toBe('42P01')
    expect(setupMissingError().message).toContain('20260727140000')
  })
})

describe('the downloadable snapshot', () => {
  it('carries the board as loaded, not a sync format', () => {
    const snapshot = boardSnapshot({
      items: [{ id: 'item-1' }],
      comments: [{ id: 'comment-1' }],
      exportedAt: '2026-07-27T10:00:00.000Z',
    })
    expect(snapshot.source).toBe('supabase')
    expect(snapshot.workspace.id).toBe(HQ_WORKSPACE_ID)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.members).toEqual([])
    expect(snapshot.attachments).toEqual([])
    expect(snapshot.exported_at).toBe('2026-07-27T10:00:00.000Z')
  })
})

describe('copy for the storage mode in use', () => {
  it('never calls the account-backed board a local file', () => {
    const copy = boardCopy({ accountBacked: true, memberCount: 2 })
    expect(copy.live).toBe(true)
    expect(copy.canSwitchIdentity).toBe(false)
    expect(copy.canImport).toBe(false)
    expect(copy.showInvite).toBe(false)
    expect(copy.statusDetail).toContain('2 admins')
    expect(copy.eyebrow.toLowerCase()).not.toContain('lokal')
    expect(copy.steps).toHaveLength(3)
  })

  it('counts a single admin in the singular', () => {
    expect(boardCopy({ accountBacked: true, memberCount: 1 }).statusDetail).toContain('1 admin ')
  })

  it('keeps the invite flow for the hosted worker build', () => {
    const copy = boardCopy({ online: true, memberCount: 2 })
    expect(copy.showInvite).toBe(true)
    expect(copy.canSwitchIdentity).toBe(false)
    expect(copy.shareLabel).toBe('Kopier invitasjonslenke')
    expect(boardCopy({ online: true, copied: true }).shareLabel).toBe('Lenke kopiert')
  })

  it('keeps the file workflow for the device-local build', () => {
    const copy = boardCopy({ revision: 7 })
    expect(copy.live).toBe(false)
    expect(copy.canSwitchIdentity).toBe(true)
    expect(copy.canImport).toBe(true)
    expect(copy.statusDetail).toContain('Revisjon 7')
  })

  it('lets the account-backed board win over the online flag', () => {
    expect(boardCopy({ online: true, accountBacked: true }).showInvite).toBe(false)
  })
})
