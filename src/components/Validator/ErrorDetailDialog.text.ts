import { RunErrorGroup } from '@/utils/k6/stats'

import { describeCategory, describeCode } from './format'

export type Lang = 'en' | 'vi'

/**
 * The dialog's text in both languages. ponytail: a local dictionary, not app
 * i18n — only this dialog is read by testers who report in Vietnamese. Move to
 * i18next if more screens need it.
 */
export const TEXT = {
  en: {
    title: 'Error detail',
    close: 'Close',
    message: 'Message',
    transaction: 'Transaction',
    request: 'Request',
    occurrences: 'Occurrences',
    dataRows: 'Distinct data rows',
    failedUsers: 'Failed users',
    of: 'of',
    iteration: 'Iteration',
    dataRow: 'Data row',
    status: {
      '500':
        '500 Internal Server Error: the application threw an error while processing the request.',
      '502':
        '502 Bad Gateway: the proxy / gateway got no valid answer from the application behind it.',
      '503':
        '503 Service Unavailable: the server or gateway refused the request — overloaded or restarting.',
      '504':
        '504 Gateway Timeout: the gateway gave up waiting for the application.',
    } as Record<string, string>,
    serverFallback: 'The server failed while handling the request.',
    serverSide:
      'This is a server-side failure — the request reached the server, the test script did not break it.',
    causes:
      'Likely causes: an unhandled exception in the API, a slow database query or downstream call hitting its timeout, or the server running out of threads / DB connections under load. Response times close to a fixed value (e.g. ~60 s or ~120 s) point at a timeout.',
    where:
      'k6 does not keep the response body — look up this endpoint in the application / gateway log at the run time (stack trace, timeout, pool exhausted), and compare with CPU, memory and DB connections on the server. Regenerated scripts also log a [5xx] line with tier=gateway / app / database in the Logs tab.',
    client:
      'The server rejected the request: usually an expired or uncorrelated token/session (401/403), a wrong id (404) or a body built from a missing value (400).',
  },
  vi: {
    title: 'Chi tiết lỗi',
    close: 'Đóng',
    message: 'Thông báo',
    transaction: 'Transaction',
    request: 'Request',
    occurrences: 'Số lần lỗi',
    dataRows: 'Dòng dữ liệu (khác nhau)',
    failedUsers: 'User bị lỗi',
    of: 'trên',
    iteration: 'Vòng lặp',
    dataRow: 'Dòng dữ liệu',
    status: {
      '500':
        '500 Internal Server Error: ứng dụng phát sinh lỗi (exception) khi xử lý request.',
      '502':
        '502 Bad Gateway: proxy / gateway không nhận được phản hồi hợp lệ từ ứng dụng phía sau.',
      '503':
        '503 Service Unavailable: server hoặc gateway từ chối request — đang quá tải hoặc đang khởi động lại.',
      '504':
        '504 Gateway Timeout: gateway chờ ứng dụng phản hồi quá thời gian cho phép.',
    } as Record<string, string>,
    serverFallback: 'Server gặp lỗi khi xử lý request.',
    serverSide:
      'Đây là lỗi phía server — request đã tới server, không phải do script test gây ra.',
    causes:
      'Nguyên nhân thường gặp: API ném exception không được xử lý, câu truy vấn DB hoặc service phía sau chạy chậm và bị timeout, hoặc server hết thread / connection DB khi chịu tải. Thời gian phản hồi dồn quanh một mốc cố định (vd. ~60 s hoặc ~120 s) là dấu hiệu timeout.',
    where:
      'k6 không lưu nội dung response — tra endpoint này trong log ứng dụng / gateway tại thời điểm chạy test (stack trace, timeout, hết connection pool), và đối chiếu CPU, RAM, số connection DB của server. Script sinh lại sẽ ghi thêm dòng [5xx] có tier=gateway / app / database trong tab Logs.',
    client:
      'Server từ chối request: thường do token/session hết hạn hoặc chưa được correlation (401/403), sai id (404), hoặc body thiếu giá trị (400).',
  },
}

/**
 * What the code means and where to look next. k6 records no response body,
 * so a 5xx can only point at the server log, not explain itself.
 */
export function hintFor(error: RunErrorGroup, lang: Lang) {
  const text = TEXT[lang]
  const category = describeCategory(error)

  if (category === 'HTTP 5xx') {
    return [
      `${text.status[describeCode(error)] ?? text.serverFallback} ${text.serverSide}`,
      text.causes,
      text.where,
    ]
  }

  if (category === 'HTTP 4xx') {
    return [text.client]
  }

  return []
}
