import { describe, expect, it } from 'vitest'

import { parseVuGen } from './parseVuGen'
import { findLink, fixMojibake } from './resolveVuGenLinks'

describe('fixMojibake', () => {
  it('restores UTF-8 shown as cp1252', () => {
    expect(fixMojibake('KhaÌ\u0081m phaÌ\u0081 ViÃªÌ£t Nam').normalize()).toBe(
      'Khám phá Việt Nam'.normalize()
    )
  })
})

describe('web_link', () => {
  const source = `Action(){
    web_url("home", "URL=https://a.test/vi/home", LAST);
    web_link("Tin", "Text=Tin t\\xC6\\xB0\\xCC\\x81c", "Ordinal=1", LAST);
  }`

  it('is imported unresolved after its page', () => {
    const result = parseVuGen(source)

    expect(result?.requests[1]?.link).toEqual({
      text: 'Tin tÆ°Ì\u0081c',
      ordinal: 1,
      from: 0,
    })
  })

  it('is found by text and ordinal', () => {
    const html = '<a href="/x">Tin tức</a><a href="/y">Tin tức</a>'

    expect(findLink(html, 'https://a.test/vi/home', 'Tin tÆ°Ì\u0081c', 2)).toBe(
      'https://a.test/y'
    )
  })
})
