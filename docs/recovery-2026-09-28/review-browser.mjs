// Independent, reproducible visual and journey evidence; no app source mutation.
// HD_REVIEW_ROOT=/path/to/repo HD_REVIEW_PHASE=baseline node review-browser.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.env.HD_REVIEW_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const phase = process.env.HD_REVIEW_PHASE || 'baseline';
const scope = process.env.HD_REVIEW_SCOPE || 'all';
const port = Number(process.env.HD_REVIEW_PORT || 5181);
const out = path.join(root, 'docs/recovery-2026-09-28/evidence', phase);
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/playwright/index.mjs')));
const { mockSupabaseRoutes, REF, SESSION, PROFILE } = await import(pathToFileURL(path.join(root, 'tests/fixtures/mockSupabase.js')));
await fs.mkdir(out, { recursive: true });
const devLog = await fs.open(path.join(out, 'dev-server.txt'), 'w');
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'e2e', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, env: { ...process.env, DOJO_PUBLIC_BUILD: '1', DOJO_NATIVE_BUILD: '1' }, stdio: ['ignore', devLog.fd, devLog.fd],
});
const base = 'http://127.0.0.1:' + port;
async function sourceFingerprint() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file + '\0'); hash.update(await fs.readFile(path.join(root, file))); }
  return { algorithm: 'sha256 of sorted tracked and unignored src path NUL then file bytes', fileCount: files.length, sha256: hash.digest('hex') };
}
const report = { phase, startedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceStart: await sourceFingerprint(), viewportMode: 'Chromium responsive browser, not native device', fontMode: 'Bundled native fonts served in browser', screenshots: [], journeys: [], failures: [] };
let browser;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { const r = await fetch(base); if (r.ok) { ready = true; break; } } catch { /* startup */ }
    if (server.exitCode !== null) throw new Error('Review Vite exited before ready: ' + server.exitCode);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Review Vite did not become ready in 20 seconds');
  browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM || '/tmp/hanzi-chromium/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/hanzi-chromium/lib', FONTCONFIG_FILE: '/tmp/hanzi-system-fonts/fonts.conf' } });

  async function contextFor(theme, width = 390, large = false, motion = 'no-preference', anonymous = false) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 844 }, reducedMotion: motion, colorScheme: theme });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await mockSupabaseRoutes(page);
    // Dev HTML retains the CDN tags that the native build strips. The bundled
    // native stylesheet is active here; deny unused CDN fonts for deterministic
    // offline rendering and avoid waiting for an unavailable external host.
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    await page.route('**/rest/v1/profiles*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().headers().accept?.includes('pgrst.object') ? { ...PROFILE, theme } : [{ ...PROFILE, theme }]) }));
    await page.addInitScript(({ ref, session, signedIn }) => {
      if (signedIn) localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify(session));
    }, { ref: REF, session: SESSION, signedIn: !anonymous });
    return { context, page, errors, theme, width, large, motion };
  }
  async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getTiming().iterations) && a.playState === 'running').map(a => a.finished.catch(() => {}))));
    await page.waitForTimeout(160);
  }
  async function largeText(page) {
    await page.evaluate(() => {
      const data = [...document.querySelectorAll('body *')].filter(e => !['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(e.tagName)).map(e => { const s = getComputedStyle(e); return [e, parseFloat(s.fontSize), parseFloat(s.lineHeight)]; });
      for (const [el, size, line] of data) { if (size) el.style.setProperty('font-size', size * 2 + 'px', 'important'); if (line) el.style.setProperty('line-height', line * 2 + 'px', 'important'); }
    });
  }
  async function capture(state, name) {
    const { page, theme, width, large, motion, errors } = state;
    await settle(page);
    if (large && !state.scaled) { await largeText(page); state.scaled = true; await settle(page); }
    const file = name + '-' + width + '-' + theme + (large ? '-text200' : '') + (motion === 'reduce' ? '-reduced' : '') + '.png';
    const measurements = await page.evaluate(() => {
      const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const targets = [...document.querySelectorAll('button,a[href],[role=button],input,select')].filter(visible).map(e => { const r = e.getBoundingClientRect(); return { label: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 85), width: +r.width.toFixed(1), height: +r.height.toFixed(1), disabled: !!e.disabled, viewport: r.bottom > 0 && r.top < innerHeight }; });
      const parse = value => {
        const n = value.match(/[\d.]+/g)?.map(Number);
        if (!n || n.length < 3) return null;
        return value.startsWith('color(srgb') ? [...n.slice(0, 3), n[3] ?? 1] : [...n.slice(0, 3).map(x => x / 255), n[3] ?? 1];
      };
      const luminance = rgb => rgb.slice(0, 3).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((n, x, i) => n + x * [.2126, .7152, .0722][i], 0);
      const contrastSamples = [...document.querySelectorAll('button,span,div,p')].filter(visible).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && /^(péngyou|nǐ hǎo|Always|Start reviewing|Start reading|Pinyin|Then read|Your week)$/.test(e.textContent.trim())).slice(0, 15).flatMap(e => {
        const chain = []; for (let p = e; p; p = p.parentElement) chain.unshift(p);
        if (chain.some(p => getComputedStyle(p).opacity !== '1' || getComputedStyle(p).backgroundImage !== 'none')) return [];
        let bg = [1, 1, 1];
        for (const p of chain) { const c = parse(getComputedStyle(p).backgroundColor); if (c) bg = c.slice(0, 3).map((x, i) => x * c[3] + bg[i] * (1 - c[3])); }
        const style = getComputedStyle(e); const color = parse(style.color); if (!color || color[3] !== 1) return [];
        const a = luminance(color), b = luminance(bg); const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const size = parseFloat(style.fontSize); const large = size >= 24 || (size >= 18.666 && Number(style.fontWeight) >= 700);
        return [{ text: e.textContent.trim(), color: style.color, background: bg, fontSize: size, fontWeight: style.fontWeight, ratio: +ratio.toFixed(2), required: large ? 3 : 4.5, passes: ratio >= (large ? 3 : 4.5) }];
      });
      return { title: document.title, pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, heading: [...document.querySelectorAll('h1,h2')].filter(visible).map(e => e.textContent).slice(0, 8), undersizedTargets: targets.filter(t => !t.disabled && (t.width < 43.5 || t.height < 43.5)).slice(0, 25), targetCount: targets.length, contrastSamples, theme: document.documentElement.dataset.theme, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, frameworkOverlay: !!document.querySelector('vite-error-overlay'), contentLength: document.body.innerText.trim().length };
    });
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push({ file, route: new URL(page.url()).pathname, theme, width, largeTextStress: large, motion, ...measurements, pageErrors: [...errors] });
    console.log(file, JSON.stringify({ overflow: measurements.horizontalOverflow, smallTargets: measurements.undersizedTargets.length, errors: errors.length }));
  }
  async function home(page) { await page.goto(base); await page.getByRole('button', { name: /Start reviewing/ }).waitFor(); }
  async function story(page) {
    await page.goto(base + '/stories');
    await page.getByTestId('story-shelf-rail').getByRole('button', { name: /公园里的下午/ }).first().click();
    await page.getByRole('button', { name: /Back to (library|story)/i }).waitFor();
    await page.getByRole('button', { name: /Start reading/i }).waitFor();
  }
  async function reveal(page) {
    await page.goto(base + '/study');
    const action = page.getByRole('button', { name: /Show answer|flashcard.*tap to reveal/i }).first();
    await action.waitFor();
    return action;
  }
  for (const theme of scope === 'all' ? ['light', 'dark'] : []) {
    const s = await contextFor(theme);
    try {
      await home(s.page); await capture(s, 'home');
      await reveal(s.page); await capture(s, 'study-question');
      await s.page.getByRole('button', { name: /Show answer|flashcard.*tap to reveal/i }).first().click();
      await s.page.getByRole('button', { name: /Good/i }).waitFor(); await capture(s, 'study-answer');
      await s.page.goto(base + '/stories'); await s.page.getByTestId('story-shelf-rail').first().waitFor(); await capture(s, 'stories');
      await story(s.page); await capture(s, 'reader-launch');
      await s.page.getByRole('button', { name: /Start reading/i }).click();
      await s.page.getByText('今天', { exact: true }).first().click();
      await s.page.getByText('today', { exact: true }).waitFor(); await capture(s, 'reader-lookup');
      await s.page.getByRole('button', { name: 'Close', exact: true }).click();
      const settings = s.page.getByRole('button', { name: /Reader settings/i });
      await settings.click();
      const dialog = s.page.getByRole('dialog', { name: /Reader settings/i });
      await dialog.getByRole('button', { name: 'Always', exact: true }).click();
      const remainsOpen = await dialog.isVisible();
      await capture(s, 'reader-settings');
      await s.page.keyboard.press('Escape');
      const focusReturns = await settings.evaluate(e => e === document.activeElement);
      report.journeys.push({ theme, name: 'Reader lookup/settings/escape', remainsOpenAfterChoice: remainsOpen, focusReturns });
      await s.page.goto(base + '/practice'); await s.page.getByRole('heading', { name: 'Practice', exact: true }).waitFor(); await capture(s, 'practice');
    } catch (error) { report.failures.push({ scope: 'core-' + theme, message: error.stack }); await s.page.screenshot({ path: path.join(out, 'failure-core-' + theme + '.png'), fullPage: true }); }
    await s.context.close();
  }
  for (const spec of [
    { width: 320, theme: 'light', route: 'home' }, { width: 430, theme: 'dark', route: 'home' },
    { width: 320, theme: 'dark', route: 'study' }, { width: 430, theme: 'light', route: 'stories' },
    { width: 320, theme: 'light', route: 'home', large: true }, { width: 320, theme: 'dark', route: 'study', large: true },
    { width: 390, theme: 'light', route: 'stories', large: true }, { width: 390, theme: 'dark', route: 'reader', large: true },
    { width: 390, theme: 'light', route: 'home', motion: 'reduce' },
    { width: 1280, theme: 'light', route: 'home' }, { width: 1280, theme: 'dark', route: 'stories' },
  ].filter(spec => scope !== 'auth' && (scope !== 'spot' || (spec.large && spec.width === 320 && ['home', 'study'].includes(spec.route))))) {
    const s = await contextFor(spec.theme, spec.width, spec.large, spec.motion);
    try {
      if (spec.route === 'home') await home(s.page);
      if (spec.route === 'study') { const action = await reveal(s.page); await action.click(); await s.page.getByRole('button', { name: /Good/i }).waitFor(); }
      if (spec.route === 'stories') { await s.page.goto(base + '/stories'); await s.page.getByTestId('story-shelf-rail').first().waitFor(); }
      if (spec.route === 'reader') { await story(s.page); await s.page.getByRole('button', { name: /Start reading/i }).click(); }
      await capture(s, spec.route);
      if (spec.route === 'study' && spec.large) {
        const grade = s.page.getByRole('button', { name: /Good/i });
        await grade.scrollIntoViewIfNeeded();
        const hit = await grade.evaluate(e => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { visibleTop: r.y >= 0, visibleBottom: r.bottom <= innerHeight, hit: !!top && (top === e || e.contains(top)) }; });
        report.journeys.push({ name: 'Large text grade reachability after scrolling', width: spec.width, ...hit });
        await capture(s, 'study-grades-scrolled');
      }
    } catch (error) { report.failures.push({ scope: JSON.stringify(spec), message: error.stack }); }
    await s.context.close();
  }
  if (phase !== 'baseline' && scope !== 'spot') {
    for (const spec of [
      { name: 'intro-answer', width: 390, theme: 'light' },
      { name: 'intro-answer', width: 320, theme: 'light', large: true },
      { name: 'auth', width: 390, theme: 'dark' },
      { name: 'auth', width: 320, theme: 'light', large: true },
    ].filter(spec => scope !== 'auth' || spec.name === 'auth')) {
      const s = await contextFor(spec.theme, spec.width, spec.large, 'no-preference', true);
      try {
        await s.page.goto(base);
        if (spec.name === 'intro-answer') {
          await s.page.getByRole('button', { name: /Start your first story/i }).click();
          await s.page.getByRole('button', { name: /Reveal the meaning/i }).click();
          await s.page.getByRole('button', { name: /See it in a story/i }).waitFor();
        } else {
          await s.page.getByRole('button', { name: /^Log in$/i }).click();
          await s.page.getByLabel('Email').waitFor();
        }
        // Anonymous users have no server theme. Exercise the shared dark tokens
        // explicitly; this is a rendering check, not a persisted preference test.
        await s.page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, spec.theme);
        await capture(s, spec.name);
      } catch (error) { report.failures.push({ scope: JSON.stringify(spec), message: error.stack }); }
      await s.context.close();
    }
  }
} catch (error) { report.failures.push({ scope: 'runtime', message: error.stack }); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  report.sourceEnd = await sourceFingerprint();
  report.sourceStable = report.sourceStart.sha256 === report.sourceEnd.sha256;
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); server.kill('SIGTERM'); await devLog.close();
}
