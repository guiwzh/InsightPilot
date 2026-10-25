// 查询结果 → CSV。按 RFC 4180 转义，并防 CSV 公式注入（OWASP）：
// 以 = + - @ 开头的文本在 Excel 里会被当成公式执行，评价内容这类用户输入可能借此注入，所以前面加单引号。
// 数值不处理，负数照常导出。

const FORMULA_PREFIX = /^[=+\-@\t\r]/

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 带 UTF-8 BOM，Excel 直接打开中文不乱码 */
export function toCsv(columns: string[], rows: unknown[][]): string {
  const lines = [columns, ...rows].map((row) => row.map(escapeCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** 文件名只保留安全字符，防止路径穿越和响应头注入 */
export function safeFilename(name: string | undefined, fallback = '查询结果') {
  const cleaned = (name ?? '').replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 60)
  return cleaned || fallback
}
