import { readFileSync, writeFileSync } from 'fs'
const [part, out] = process.argv.slice(2)
const files = readFileSync(part, 'utf8').split('\n').filter(Boolean)
const M = {
 'src/storyReading.js': ['reviewed-full (Chinese paths; JP/RU branches skimmed - frozen) + executed by audit scripts', 'CNT-02,CNT-05,CNT-06'],
 'src/storyTiers.js': ['reviewed-full', 'CNT-06'],
 'src/storyShelfFlat.js': ['reviewed-full', 'none'],
 'src/pinyin.js': ['reviewed-full', 'CNT-09'],
 'src/toneColor.js': ['reviewed-full', 'none'],
 'src/Tones.jsx': ['reviewed-skim (L20-230 pool/tone logic)', 'CNT-08'],
 'src/StoryReaderImmersive.jsx': ['reviewed-skim (L276-395 utterance load, L600-700 narration/synth fallback; rest not read)', 'CNT-07'],
 'src/ttsAudio.js': ['reviewed-skim (L90-130)', 'CNT-04'],
 'src/AudioButton.jsx': ['reviewed-skim (L1-60)', 'none'],
 'src/audioPlayback.js': ['reviewed-skim (grep)', 'none'],
 'src/tts/overrides.js': ['reviewed-skim (L1-60)', 'CNT-02'],
 'src/tts/sources.js': ['reviewed-skim (L1-50)', 'CNT-01'],
 'src/tts/ssml.js': ['reviewed-skim (grep)', 'none'],
 'src/tts/utterances.js': ['reviewed-skim (grep)', 'CNT-07'],
 'src/Stories.jsx': ['reviewed-skim (grep: gating/shelf wiring, story queries)', 'none'],
 'src/ReaderLaunch.jsx': ['reviewed-skim (grep)', 'none'],
 'src/readerMode.js': ['reviewed-skim (grep)', 'none'],
 'src/ManhuaCompletion.jsx': ['reviewed-skim (grep continues)', 'none'],
 'src/manhuaProgress.js': ['reviewed-skim (grep)', 'none'],
 'src/DictEntryView.jsx': ['reviewed-skim (grep tone split)', 'none'],
 'story-utterances.mjs': ['reviewed-skim (L1-80)', 'CNT-07'],
 'check-authored-stories.mjs': ['reviewed-skim (L1-80) + executed offline (--language chinese: 171 passed, 0 failed)', 'none'],
 'check-content-integrity.mjs': ['reviewed-skim (header; requires service key - not run)', 'CNT-05'],
 'check-vocabulary-integrity.mjs': ['reviewed-skim (grep; requires service key - not run)', 'none'],
 'audit-story-coverage.mjs': ['reviewed-skim (grep; requires service key - not run)', 'none'],
 'artProvenance.mjs': ['reviewed-skim (L1-40)', 'CNT-11'],
 'fetch-manhua-art.mjs': ['reviewed-skim (L30-70) + executed --check (offline, read-only): 1/117 entries carry prompt+date', 'CNT-11'],
 'fetch-webfonts.mjs': ['reviewed-skim (grep OFL)', 'CNT-10'],
 'seed-vocab.mjs': ['reviewed-skim (grep: empty-file handling)', 'none'],
 'seed-examples.mjs': ['reviewed-skim (grep: pinyin-pro + fixDeParticlePinyin)', 'none'],
 'storyContentDebt.mjs': ['reviewed-skim (grep only)', 'none'],
 'storyVocabAudit.mjs': ['reviewed-skim (grep only)', 'none'],
 'data/authored-stories.json': ['validated by script (segmentation/polyphone/coverage audits; md5 vs prod: 171/171 Chinese stories byte-identical to published rows)', 'CNT-01,CNT-02,CNT-05'],
 'data/hsk1.json': ['validated by script (empty array; documented)', 'none'],
 'data/hsk2.json': ['validated by script (empty array; documented)', 'none'],
 'data/hsk1-vocab-snapshot.json': ['validated by script (300 rows, polyphone lookup)', 'CNT-08'],
 'data/hsk2-vocab-snapshot.json': ['validated by script (497 rows cumulative; used as vocab map)', 'CNT-08'],
 'data/hsk3.json': ['validated by script (453 rows; polyphone/proper-noun readings)', 'CNT-01'],
 'data/hsk4.json': ['validated by script (929 rows; used in vocab map)', 'CNT-01'],
 'data/hsk5.json': ['validated by script (row count only)', 'CNT-01'],
 'data/hsk6.json': ['validated by script (row count only)', 'CNT-01'],
 'data/hsk3-vocab-snapshot.json': ['validated by script (row count only)', 'none'],
 'data/hsk-curriculum-bands.json': ['validated by script (top-level keys only)', 'none'],
 'data/tts-pronunciation-overrides.json': ['reviewed-skim (first entries)', 'CNT-02'],
 '.': null,
}
for (const f of ['inkbound-hsk1-ep01','inkbound-hsk2-ep02','inkbound-hsk3-ep03','noodleshop-hsk1-ep01','noodleshop-hsk1-ep02','noodleshop-hsk2-ep03','train-hsk2-ep01','upstairs-hsk3-ep01']) {
  M['data/manhua/' + f + '.json'] = ['validated by script (panel art exists, beats monotonic, every line covered, md5 matches prod; polyphone audit)', f === 'upstairs-hsk3-ep01' ? 'CNT-02,CNT-11' : 'none']
  M['data/manhua/' + f + '.art.json'] = ['validated by script (fetch-manhua-art --check; panels vs manifest)', 'CNT-11']
}
const lines = files.map(f => {
  const m = M[f]
  if (m) return f + ' | ' + m[0] + ' | ' + m[1]
  if (/(jlpt|n4|russian|kanji)/i.test(f)) return f + ' | excluded(frozen non-Chinese track data) | none'
  if (f.startsWith('data/manhua/') ) return f + ' | excluded(time budget: not opened) | none'
  return f + ' | excluded(time budget: not opened) | none'
})
writeFileSync(out, lines.join('\n') + '\n')
const c = {}; lines.forEach(l => { const k = l.split(' | ')[1].split(' ')[0]; c[k] = (c[k] || 0) + 1 }); console.log(c, lines.length)
