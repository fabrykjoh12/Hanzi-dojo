// Pure parsing for Tatoeba's "Sentence pairs" export. Each line is tab-separated
// with four columns: <cmn_id> <cmn_text> <eng_id> <eng_text>, e.g.
//   123\t我在学中文。\t456\tI am learning Chinese.
// We keep only the two texts; the sentence ids and pinyin aren't stored (pinyin
// isn't in the Tatoeba data — it stays NULL in dict_examples for v1).

// True when the string contains at least one Han character — guards against
// blank or mis-columned rows sneaking a non-Chinese "hanzi" into the table.
const HAS_HAN = /\p{Script=Han}/u

export function parseTatoebaPairLine(line) {
  const raw = (line || '').replace(/\r$/, '')
  if (!raw.trim()) return null
  const fields = raw.split('\t')
  if (fields.length < 4) return null
  const hanzi = (fields[1] || '').trim()
  const english = (fields[3] || '').trim()
  if (!hanzi || !english) return null
  if (!HAS_HAN.test(hanzi)) return null
  return { hanzi, english }
}
