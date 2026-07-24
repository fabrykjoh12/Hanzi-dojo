// Filter controls for the Stories library: read-status and format.
//
// Pure so the Stories screen can render the segmented controls from these lists
// and filter with one call, and so the logic is unit-tested independent of the
// (large) component.

import { isPracticeFormat } from './storyFormat'

export const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
]

export const FORMAT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'stories', label: 'Stories' },
  { key: 'practice', label: 'Practice' },
]

function isRead(readIds, id) {
  if (!readIds) return false
  return readIds instanceof Set ? readIds.has(id) : Boolean(readIds[id])
}

// filterStories(stories, { status, format }, readIds) → the subset matching both
// filters. `readIds` may be a Set or a plain map of id→truthy.
export function filterStories(stories, { status = 'all', format = 'all' } = {}, readIds) {
  const list = Array.isArray(stories) ? stories : []
  return list.filter(s => {
    if (!s) return false
    const read = isRead(readIds, s.id)
    if (status === 'read' && !read) return false
    if (status === 'unread' && read) return false
    if (format === 'stories' && isPracticeFormat(s)) return false
    if (format === 'practice' && !isPracticeFormat(s)) return false
    return true
  })
}
