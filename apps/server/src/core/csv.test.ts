import { describe, expect, it } from 'vitest'
import { safeFilename, toCsv } from './csv'

describe('toCsv', () => {
  it('带 BOM，用 CRLF 换行', () => {
    expect(toCsv(['渠道', '人数'], [['直播间', 765]])).toBe('﻿渠道,人数\r\n直播间,765\r\n')
  })

  it('逗号、引号、换行按 RFC 4180 转义', () => {
    expect(toCsv(['a'], [['x,y'], ['say "hi"'], ['line1\nline2']])).toBe('﻿a\r\n"x,y"\r\n"say ""hi"""\r\n"line1\nline2"\r\n')
  })

  it('以 = + - @ 开头的文本加单引号，防止在 Excel 里被当成公式', () => {
    const csv = toCsv(['评价'], [['=HYPERLINK("http://evil","点我")'], ['@SUM(1)'], ['-1+2']])
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""点我"")"`)
    expect(csv).toContain(`'@SUM(1)`)
    expect(csv).toContain(`'-1+2`)
  })

  it('负数和空值照常导出', () => {
    expect(toCsv(['n', 'm'], [[-25, null]])).toBe('﻿n,m\r\n-25,\r\n')
  })
})

describe('safeFilename', () => {
  it('去掉路径和响应头里的危险字符', () => {
    expect(safeFilename('../../etc/passwd')).toBe('....etcpasswd')
    expect(safeFilename('a\r\nSet-Cookie: x')).toBe('aSet-Cookie x')
    expect(safeFilename('   ')).toBe('查询结果')
  })
})
