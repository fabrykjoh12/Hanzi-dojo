#!/usr/bin/env node
//
// The one script that talks to the real Azure Speech endpoint on purpose.
//
// It exists to answer a question the mocks cannot: does the SSML we build
// actually sound right? So it synthesizes a handful of short, deliberately
// chosen samples and writes them to a scratch directory for a human to listen
// to. That is all it does.
//
// It is OFF unless you ask for it twice:
//   TTS_INTEGRATION=1  in the environment, AND  --confirm  on the command line.
//
// It never runs in CI, never touches the database or the storage bucket, and
// never modifies production content. Cost is a few cents.
//
//   TTS_INTEGRATION=1 npm run tts:integration -- --confirm
//   node --env-file=.env.script tts-integration-check.mjs --confirm

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateTtsEnv, describeConfig } from './src/tts/config.js'
import { createProvider } from './src/tts/providers/index.js'
import { buildVariantRequest } from './src/tts/request.js'
import { createLogger, secretsFromConfig } from './src/tts/log.js'

// Chosen to cover the things that actually go wrong in Mandarin TTS, not to be
// a broad corpus. Nine clips total - under the ten-file ceiling.
const SAMPLES = [
  { name: '01-nihao', variant: 'word', text: '你好', why: 'baseline single word' },
  { name: '02-nihao-slow', variant: 'word_slow', text: '你好', why: 'slow speech stays natural, not draggy' },
  { name: '03-yinhang', variant: 'word', text: '银行', why: 'polyphone: 行 must be háng, not xíng', pinyin: 'yínháng' },
  { name: '04-yinhang-slow', variant: 'word_slow', text: '银行', why: 'the pin survives a slower rate', pinyin: 'yínháng' },
  { name: '05-sentence', variant: 'sentence', text: '我今天去银行。', why: 'polyphone in context', pinyin: 'yínháng', pinText: '银行' },
  { name: '06-measure-word', variant: 'sentence', text: '我买了三本书。', why: 'numbers and measure words' },
  { name: '07-question', variant: 'sentence', text: '你明天想去北京吗？', why: 'question intonation on 吗' },
  { name: '08-sentence-slow', variant: 'sentence_slow', text: '我今天去银行。', why: 'slow sentence keeps its phrasing', pinyin: 'yínháng', pinText: '银行' },
  { name: '09-narration', variant: 'utterance', text: '一天晚上，小明在森林里发现了一扇奇怪的门。', why: 'story narration and comma pacing' },
]

const OUT_DIR = join('artifacts', 'tts-integration')

const argv = process.argv.slice(2)
const confirmed = argv.indexOf('--confirm') !== -1

if (process.env.TTS_INTEGRATION !== '1') {
  process.stderr.write(
    'Refusing to run: this check makes REAL, paid Azure requests.\n'
    + 'Set TTS_INTEGRATION=1 and pass --confirm to run it.\n'
  )
  process.exit(1)
}
if (!confirmed) {
  process.stderr.write('Refusing to run without --confirm. This check makes real, paid Azure requests.\n')
  process.exit(1)
}

let config
try {
  config = validateTtsEnv(process.env, { requireCredentials: true })
} catch (err) {
  process.stderr.write(err.message + '\n')
  process.exit(1)
}
if (config.provider !== 'azure') {
  process.stderr.write('This check is for the real Azure provider; TTS_DEFAULT_PROVIDER is "' + config.provider + '".\n')
  process.exit(1)
}

const logger = createLogger({ secrets: secretsFromConfig(config) })

function overridesFor(sample) {
  if (!sample.pinyin) return []
  return [{
    matched_text: sample.pinText || sample.text,
    pinyin: sample.pinyin,
    verification: 'unreviewed',
  }]
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  logger.info('Azure integration check')
  logger.info('  config:', JSON.stringify(describeConfig(config)))
  logger.info('  samples:', SAMPLES.length)
  logger.info('  output: ', OUT_DIR, '(scratch only - no database or bucket write)')

  const provider = createProvider(config)
  let requests = 0
  let characters = 0
  let failed = 0

  for (const sample of SAMPLES) {
    const voice = sample.variant.indexOf('utterance') === 0 ? config.voices.story : config.voices.flashcard
    const request = buildVariantRequest(sample.variant, {
      text: sample.text,
      locale: config.locale,
      voice,
      pronunciationOverrides: overridesFor(sample),
      provider: config.provider,
    })

    try {
      const result = await provider.synthesize(request)
      requests += result.requestCount
      characters += result.characterCount
      const file = join(OUT_DIR, sample.name + '.mp3')
      writeFileSync(file, result.audio)
      logger.info(
        '  ok ' + sample.name,
        '(' + result.byteLength + ' bytes, ' + result.durationMs + 'ms)',
        '-', sample.why
      )
    } catch (err) {
      failed += 1
      logger.error('  x ' + sample.name + ' - ' + (err.code || 'error') + ': ' + err.message)
    }
  }

  logger.info('\nSummary')
  logger.info('  requests made:   ', requests)
  logger.info('  characters sent: ', characters)
  logger.info('  files written:   ', SAMPLES.length - failed, 'in', OUT_DIR)
  logger.info('  failures:        ', failed)
  logger.info('\nListen to the files and check, in order:')
  logger.info('  03/04  银行 is "yinhang" with a rising second syllable, not "yinxing"')
  logger.info('  05/08  the same pin holds inside a sentence, at both speeds')
  logger.info('  06     三本书 is read with the measure word, not spelled out')
  logger.info('  07     the 吗 question rises at the end')
  logger.info('  09     the narration pauses at the comma')

  logger.json({ ok: failed === 0, requests, characters, samples: SAMPLES.length, failed })
  if (failed > 0) process.exitCode = 1
}

main().catch(err => {
  logger.error('Integration check failed:', err.message)
  process.exit(1)
})
