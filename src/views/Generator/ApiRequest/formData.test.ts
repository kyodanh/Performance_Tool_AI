import { describe, expect, it } from 'vitest'

import { isBinaryContent } from '@/utils/format'

import { fromProxyData, toRequest, toSendOptions } from './ApiRequest.utils'
import { FormField, buildMultipart, parseMultipart } from './formData'

const text = (name: string, value: string): FormField => ({
  name,
  type: 'text',
  value,
  fileName: '',
  contentType: '',
})

const png = '\x89PNG\r\n\x1a\n\x00\x00'
const file: FormField = {
  name: 'avatar',
  type: 'file',
  value: png,
  fileName: 'ảnh.png',
  contentType: 'image/png',
}

const timing = { timestampStart: 0, timestampEnd: 0 }

describe('buildMultipart', () => {
  it('builds a text-only body browsers would send', () => {
    const result = buildMultipart([text('title', 'Xin chào')], 'B')

    expect(result).toEqual({
      body: '--B\r\nContent-Disposition: form-data; name="title"\r\n\r\nXin chào\r\n--B--\r\n',
      contentType: 'multipart/form-data; boundary=B',
    })
  })

  it('skips unnamed fields and returns null without any', () => {
    expect(buildMultipart([text('', 'x')])).toBeNull()
  })

  it('UTF-8 encodes text parts next to a binary file', () => {
    const { body } = buildMultipart([text('title', 'é'), file], 'B')!

    expect(isBinaryContent(body)).toBe(true)
    expect(body).toContain('\r\n\r\n\xc3\xa9\r\n')
    expect(body).toContain(`\r\n\r\n${png}\r\n`)
  })
})

describe('parseMultipart', () => {
  it('round-trips text and binary fields', () => {
    const fields = [text('title', 'Xin chào'), file]
    const { body, contentType } = buildMultipart(fields)!

    expect(parseMultipart(body, contentType)).toEqual(fields)
  })

  it('reads recorded bodies that lost their \\r', () => {
    const body = '--B\nContent-Disposition: form-data; name="a"\n\n1\n--B--\n'

    expect(parseMultipart(body, 'multipart/form-data; boundary="B"')).toEqual([
      text('a', '1'),
    ])
  })

  it('returns null without a matching boundary', () => {
    expect(
      parseMultipart('plain', 'multipart/form-data; boundary=B')
    ).toBeNull()
  })
})

describe('form-data requests', () => {
  const data = {
    method: 'POST' as const,
    url: 'https://example.com/upload',
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    content: '{"ignored":true}',
    bodyType: 'form-data' as const,
    formFields: [text('token', '{csrf}'), file],
    group: 'Default group',
  }

  it('replaces the content type with the multipart one', () => {
    const request = toRequest(data, timing)

    expect(request.headers).toHaveLength(1)
    expect(request.headers[0]![1]).toMatch(/^multipart\/form-data; boundary=/)
    expect(request.content).not.toContain('ignored')
  })

  it('resolves variables in text fields when sending', () => {
    const { content } = toSendOptions(data, { csrf: 'abc' })

    expect(content).toContain('\r\n\r\nabc\r\n')
  })

  it('opens a saved request as form fields again', () => {
    const form = fromProxyData({
      id: '1',
      group: 'Default group',
      request: toRequest(data, timing),
    })

    expect(form.bodyType).toBe('form-data')
    expect(form.headers).toEqual([])
    expect(form.formFields).toEqual(data.formFields)
  })
})

describe('Data-folder files', () => {
  it('keeps the path, not the content, through build and parse', () => {
    const file: FormField = {
      name: 'file',
      type: 'file',
      value: '',
      fileName: 'a.xlsx',
      contentType: 'application/vnd.ms-excel',
      path: '/project/Data/a.xlsx',
    }
    const built = buildMultipart([text('id', '1'), file], 'b')!

    expect(built.body).toContain('<<k6studio-file:/project/Data/a.xlsx>>')
    expect(parseMultipart(built.body, built.contentType)).toEqual([
      text('id', '1'),
      file,
    ])
  })
})
