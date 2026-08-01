import { readFileSync } from 'node:fs';

// Keep E2E content tied to the same source the publisher consumes. A manifest
// edit should change the browser fixture automatically instead of leaving a
// second, hand-copied episode behind in mockSupabase.js.
export const NOODLESHOP_MANIFEST = JSON.parse(readFileSync(
  new URL('../../data/manhua/noodleshop-hsk1-ep01.json', import.meta.url),
  'utf8',
));

export const INKBOUND_MANIFEST = JSON.parse(readFileSync(
  new URL('../../data/manhua/inkbound-hsk1-ep01.json', import.meta.url),
  'utf8',
));

export const TRAIN_MANIFEST = JSON.parse(readFileSync(
  new URL('../../data/manhua/train-hsk2-ep01.json', import.meta.url),
  'utf8',
));

export const UPSTAIRS_MANIFEST = JSON.parse(readFileSync(
  new URL('../../data/manhua/upstairs-hsk3-ep01.json', import.meta.url),
  'utf8',
));

export function storyFromManhuaManifest(manifest, {
  id,
  storyNumber,
  system = manifest.system,
} = {}) {
  return {
    id,
    language: manifest.language,
    system,
    level: manifest.level,
    tier: manifest.tier == null ? 1 : manifest.tier,
    tier_min_words: manifest.tier_min_words == null ? 0 : manifest.tier_min_words,
    story_number: storyNumber,
    title: manifest.title,
    content: manifest.content,
    english_content: manifest.english_content || null,
    english_summary: manifest.english_summary || null,
    presentation: 'manhua',
    panels: manifest.panels || null,
    is_published: manifest.is_published !== false,
    has_audio: Boolean(manifest.has_audio),
    image_path: manifest.image_path || null,
  };
}

export function questionsFromManhuaManifest(manifest, storyId) {
  return (manifest.questions || []).map((question, index) => ({
    id: `${storyId}-q${index + 1}`,
    story_id: storyId,
    question_number: index + 1,
    question: question.question,
    options: question.options,
    correct_index: question.correct_index,
  }));
}
