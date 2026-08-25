import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { hasGoogleFontRequest, stripGoogleFontTags, googleFontFamilies } from './nativeFonts.mjs'
import { parseFontFaces, buildLocalCss } from './fetch-webfonts.mjs'

const INDEX_HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const WEBFONTS_CSS = readFileSync(new URL('./src/webfonts.css', import.meta.url), 'utf8')

describe('stripGoogleFontTags', () => {
  it('removes the stylesheet link and both preconnects', () => {
    const { html, removed } = stripGoogleFontTags(INDEX_HTML)
    expect(removed).toBe(3)
    expect(hasGoogleFontRequest(html)).toBe(false)
  })

  it('leaves the rest of the document alone', () => {
    const { html } = stripGoogleFontTags(INDEX_HTML)
    // The bundled Mona Sans preload is a local asset and must survive.
    expect(html).toContain('mona-sans-latin-wght-normal.woff2')
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('/src/main.jsx')
    expect(html).toContain('manifest.webmanifest')
    expect(html).toContain('og:image')
  })

  it('is idempotent', () => {
    const once = stripGoogleFontTags(INDEX_HTML).html
    const twice = stripGoogleFontTags(once)
    expect(twice.removed).toBe(0)
    expect(twice.html).toBe(once)
  })

  it('handles html with no google fonts at all', () => {
    const { html, removed } = stripGoogleFontTags('<html><body>hi</body></html>')
    expect(removed).toBe(0)
    expect(html).toBe('<html><body>hi</body></html>')
  })
})

describe('hasGoogleFontRequest', () => {
  it('is true for the shipped web index.html', () => {
    expect(hasGoogleFontRequest(INDEX_HTML)).toBe(true)
  })

  it('ignores a mention inside a comment — prose is not a request', () => {
    expect(hasGoogleFontRequest('<!-- we used to use fonts.googleapis.com -->')).toBe(false)
  })

  it('catches gstatic on its own, not just the stylesheet host', () => {
    expect(hasGoogleFontRequest('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />')).toBe(true)
  })
})

describe('the bundled fonts match what index.html asks Google for', () => {
  // This is the failure mode nothing else would catch: someone adds a family to
  // index.html, the web picks it up from the CDN, and the native build silently
  // renders it in a fallback face because fetch-webfonts.mjs was never re-run.
  it('every requested family is present in the generated stylesheet', () => {
    const families = googleFontFamilies(INDEX_HTML)
    expect(families.length).toBeGreaterThan(0)
    for (const family of families) {
      expect(WEBFONTS_CSS).toContain("font-family: '" + family + "'")
    }
  })

  it('requests exactly the three families we bundle', () => {
    expect(googleFontFamilies(INDEX_HTML).sort()).toEqual(['Inter', 'Noto Sans SC', 'Poppins'])
  })

  it('the generated stylesheet points only at local assets', () => {
    expect(WEBFONTS_CSS).not.toContain('fonts.gstatic.com')
    expect(WEBFONTS_CSS).not.toContain('fonts.googleapis.com')
    expect(WEBFONTS_CSS).toContain("url('./assets/webfonts/")
  })

  it('keeps unicode-range subsetting, so a device still only decodes what it paints', () => {
    expect(WEBFONTS_CSS).toContain('unicode-range:')
  })
})

describe('parseFontFaces / buildLocalCss', () => {
  const SAMPLE = `
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v1/abc.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* chinese */
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/notosanssc/v1/xyz.woff2) format('woff2');
  unicode-range: U+4E00-9FFF;
}
`

  it('parses family, weight, style, range and url', () => {
    const faces = parseFontFaces(SAMPLE)
    expect(faces).toHaveLength(2)
    expect(faces[0]).toMatchObject({ family: 'Inter', weight: '400', style: 'normal' })
    expect(faces[0].range).toBe('U+0000-00FF, U+0131')
    expect(faces[1]).toMatchObject({ family: 'Noto Sans SC', weight: '700' })
  })

  it('rewrites urls to local assets and preserves the rules', () => {
    const faces = parseFontFaces(SAMPLE).map((f, i) => ({ ...f, local: 'f' + i + '.woff2' }))
    const css = buildLocalCss(faces)
    expect(css).not.toContain('gstatic')
    expect(css).toContain("src: url('./assets/webfonts/f0.woff2') format('woff2')")
    expect(css).toContain("font-family: 'Noto Sans SC'")
    expect(css).toContain('font-weight: 700')
    expect(css).toContain('unicode-range: U+4E00-9FFF')
    expect(css).toContain('font-display: swap')
  })

  it('omits unicode-range when the source face had none', () => {
    const css = buildLocalCss([{ family: 'X', weight: '400', style: 'normal', range: null, local: 'x.woff2' }])
    // Check the RULE, not the whole file — the generated header legitimately
    // mentions unicode-range in prose.
    const rule = css.slice(css.indexOf('@font-face'))
    expect(rule).not.toContain('unicode-range')
  })
})
