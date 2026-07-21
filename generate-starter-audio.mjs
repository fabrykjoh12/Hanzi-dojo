// One-time: generate TTS clips for every starter sentence + word into
// public/starter-audio/. Safe to re-run. No-ops without GOOGLE_TTS_KEY (the app
// falls back to browser speech until clips exist).
import fs from 'node:fs'
import path from 'node:path'
import data from './data/starter-sentences.chinese.json' with { type: 'json' }

const KEY = process.env.GOOGLE_TTS_KEY
const OUT = path.join('public', 'starter-audio')

async function synth(text) {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'cmn-CN', name: 'cmn-CN-Wavenet-A' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`)
  return Buffer.from((await res.json()).audioContent, 'base64')
}

async function main() {
  if (!KEY) { console.log('No GOOGLE_TTS_KEY — skipping (speechSynthesis fallback covers audio).'); return }
  fs.mkdirSync(OUT, { recursive: true })
  for (const bucket of Object.values(data)) {
    for (const s of bucket) {
      fs.writeFileSync(path.join(OUT, `${s.id}.mp3`), await synth(s.hanzi))
      for (let i = 0; i < s.words.length; i++) {
        if (s.words[i].punct) continue
        fs.writeFileSync(path.join(OUT, `${s.id}-${i}.mp3`), await synth(s.words[i].hanzi))
      }
      console.log('generated', s.id)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
