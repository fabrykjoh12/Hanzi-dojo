// Storage adapter for generated audio.
//
// The Supabase client is INJECTED, never constructed here - that keeps the
// service key out of this module and lets the tests drive the whole upload path
// with a fake.
//
// Writes are idempotent because the path is the content hash: uploading the
// same clip twice is the same object, so a re-run after a crash costs nothing
// and creates no duplicate.

import { TtsStorageError } from './errors.js'
import { ttsVariantPrefix } from './storagePath.js'
import { OUTPUT_FORMAT_CONTENT_TYPE } from './constants.js'

// Supabase reports an existing object as a 409 / "Duplicate" / "already exists".
// For a content-addressed path that is not an error - it means the exact bytes
// we were about to write are already there.
function isDuplicate(error) {
  if (!error) return false
  if (error.statusCode === '409' || error.statusCode === 409 || error.status === 409) return true
  const msg = String(error.message || '').toLowerCase()
  return msg.indexOf('already exists') !== -1 || msg.indexOf('duplicate') !== -1
}

export const AUDIO_BUCKET = 'audio'

export function createTtsStorage(client, { bucket = AUDIO_BUCKET } = {}) {
  const store = () => client.storage.from(bucket)

  return {
    bucket,

    // Upload, treating "already there" as success. Returns { deduped } so the
    // caller can report how much of a run was genuinely new.
    async upload(path, bytes, { contentType = OUTPUT_FORMAT_CONTENT_TYPE } = {}) {
      if (!bytes || !bytes.byteLength) {
        throw new TtsStorageError('Refusing to upload an empty audio body to ' + path, { retryable: false })
      }
      // upsert:false so a duplicate is reported rather than silently rewritten -
      // that is what lets us distinguish a cache hit from a fresh write.
      const { error } = await store().upload(path, bytes, { contentType, upsert: false })
      if (!error) return { path, deduped: false }
      if (isDuplicate(error)) return { path, deduped: true }
      throw new TtsStorageError('Could not upload ' + path + ': ' + error.message)
    },

    async exists(path) {
      const cut = path.lastIndexOf('/')
      const dir = cut === -1 ? '' : path.slice(0, cut)
      const name = cut === -1 ? path : path.slice(cut + 1)
      const { data, error } = await store().list(dir, { search: name, limit: 100 })
      if (error) throw new TtsStorageError('Could not list ' + dir + ': ' + error.message)
      return (data || []).some(entry => entry.name === name)
    },

    // Delete every earlier generation of one variant, keeping the current file.
    //
    // Called only AFTER the database row points at `keepPath`, so a failure here
    // leaves harmless extra files rather than a row pointing at a deleted clip.
    async removeSuperseded({ locale, sourceType, sourceId, variant, keepPath }) {
      const prefix = ttsVariantPrefix({ locale, sourceType, sourceId, variant })
      const { data, error } = await store().list(prefix, { limit: 100 })
      if (error) throw new TtsStorageError('Could not list ' + prefix + ': ' + error.message)
      const keepName = keepPath ? keepPath.slice(keepPath.lastIndexOf('/') + 1) : null
      const doomed = (data || [])
        .filter(entry => entry.name && entry.name !== keepName)
        .map(entry => prefix + '/' + entry.name)
      if (doomed.length === 0) return { removed: 0 }
      const { error: removeError } = await store().remove(doomed)
      if (removeError) throw new TtsStorageError('Could not remove superseded files: ' + removeError.message)
      return { removed: doomed.length }
    },
  }
}
