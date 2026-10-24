// 业务口径（语义层）：同一个指标只有一种算法，模型写 SQL 前先读这里，避免每次自由发挥。
// 改口径只改这一个文件，Web、MCP、评测都会跟着变。
import type { MetricDefinition } from '@insightpilot/shared'

export const METRICS: MetricDefinition[] = [
  {
    name: 'GMV',
    aliases: ['成交额', '成交总额', '销售额', '交易额'],
    definition: '已支付订单的实付金额之和，按下单时间 created_at 归属日期；之后发生退款的订单也计入。',
    sql: 'SELECT sum(pay_amount) FROM shop.orders WHERE paid_at IS NOT NULL',
  },
  {
    name: '净销售额',
    aliases: ['净成交额', '扣除退款后的销售额'],
    definition: 'GMV 扣除已退款订单：已支付且状态不是 refunded 的订单实付金额之和。',
    sql: "SELECT sum(pay_amount) FROM shop.orders WHERE paid_at IS NOT NULL AND status <> 'refunded'",
  },
  {
    name: '支付订单数',
    aliases: ['订单数', '成交订单数', '下单量'],
    definition:
      '已支付的订单数（paid_at 不为空），按下单时间 created_at 归属日期，与 GMV 一致。用户只说"订单数"时默认指支付订单数；"下单数"包含未支付和已取消的订单。',
    sql: "SELECT created_at::date AS day, count(*) FROM shop.orders WHERE paid_at IS NOT NULL GROUP BY 1",
    notes: '只有用户明确说"按支付时间"时，才按 paid_at 归属日期。',
  },
  {
    name: '商品销售额',
    aliases: ['类目销售额', '品类销售额', '商品销量', '类目 GMV', '商品 GMV'],
    definition:
      '按商品或类目统计销售额时，用订单明细的 成交单价 × 数量 之和，只计已支付订单，按下单时间归属；不能用订单的 pay_amount，因为一个订单可能包含多个类目的商品。销量 = 数量之和。',
    sql: `SELECT p.category_l1, sum(i.unit_price * i.quantity) AS "销售额", sum(i.quantity) AS "销量"
FROM shop.order_items i
JOIN shop.orders o ON o.id = i.order_id
JOIN shop.products p ON p.id = i.product_id
WHERE o.paid_at IS NOT NULL
GROUP BY 1`,
  },
  {
    name: '客单价',
    aliases: ['平均订单金额', 'AOV'],
    definition: 'GMV / 支付订单数。',
    sql: 'SELECT round(sum(pay_amount) / NULLIF(count(*), 0), 2) FROM shop.orders WHERE paid_at IS NOT NULL',
  },
  {
    name: '新增用户数',
    aliases: ['新用户', '注册用户数', '拉新'],
    definition: '按注册时间 registered_at 统计的注册用户数。按渠道统计时用 users.channel_id 关联 channels。',
    sql: 'SELECT count(*) FROM shop.users WHERE registered_at >= :start AND registered_at < :end',
  },
  {
    name: '访问用户数',
    aliases: ['活跃用户', 'DAU', 'UV', '访客数'],
    definition: '有 visit 事件的去重用户数。按天统计时，同一用户同一天只算一次。',
    sql: "SELECT occurred_at::date AS day, count(DISTINCT user_id) FROM shop.user_events WHERE event_type = 'visit' GROUP BY 1",
  },
  {
    name: '下单转化率',
    aliases: ['转化率', '购买转化率', '下单率'],
    definition: '当天有 place_order 事件的去重用户数 / 当天有 visit 事件的去重用户数。跨多天汇总时，按"用户-天"去重后再相除。',
    sql: `SELECT occurred_at::date AS day,
       round(count(DISTINCT user_id) FILTER (WHERE event_type = 'place_order') * 100.0
             / NULLIF(count(DISTINCT user_id) FILTER (WHERE event_type = 'visit'), 0), 2) AS "下单转化率(%)"
FROM shop.user_events GROUP BY 1`,
    notes: '用户只说"转化率"时默认指下单转化率。按渠道统计时，渠道取用户的注册渠道（users.channel_id）。',
  },
  {
    name: '支付转化率',
    aliases: ['付款转化率'],
    definition: '当天有 pay 事件的去重用户数 / 当天有 visit 事件的去重用户数。',
    sql: `SELECT occurred_at::date AS day,
       round(count(DISTINCT user_id) FILTER (WHERE event_type = 'pay') * 100.0
             / NULLIF(count(DISTINCT user_id) FILTER (WHERE event_type = 'visit'), 0), 2)
FROM shop.user_events GROUP BY 1`,
  },
  {
    name: '加购率',
    aliases: ['加购转化率', '加入购物车比例'],
    definition: '当天有 add_cart 事件的去重用户数 / 当天有 visit 事件的去重用户数。',
    sql: `SELECT occurred_at::date AS day,
       round(count(DISTINCT user_id) FILTER (WHERE event_type = 'add_cart') * 100.0
             / NULLIF(count(DISTINCT user_id) FILTER (WHERE event_type = 'visit'), 0), 2)
FROM shop.user_events GROUP BY 1`,
  },
  {
    name: '退款率',
    aliases: ['退货率', '退款比例'],
    definition: '状态为 refunded 的订单数 / 支付订单数，按下单时间归属。按类目统计时，订单包含该类目的商品就计入该类目（一个订单可能计入多个类目）。',
    sql: `SELECT p.category_l1,
       round(count(DISTINCT o.id) FILTER (WHERE o.status = 'refunded') * 100.0
             / NULLIF(count(DISTINCT o.id), 0), 2) AS "退款率(%)"
FROM shop.orders o
JOIN shop.order_items i ON i.order_id = o.id
JOIN shop.products p ON p.id = i.product_id
WHERE o.paid_at IS NOT NULL
GROUP BY 1`,
  },
  {
    name: '复购率',
    aliases: ['回购率', '重复购买率'],
    definition: '统计周期内（按下单时间 created_at）支付订单数 ≥ 2 的用户数 / 统计周期内有支付订单的用户数。',
    sql: `SELECT round(count(*) FILTER (WHERE n >= 2) * 100.0 / NULLIF(count(*), 0), 2)
FROM (SELECT user_id, count(*) AS n FROM shop.orders WHERE paid_at IS NOT NULL GROUP BY user_id) t`,
  },
  {
    name: '毛利',
    aliases: ['毛利额', '利润', '毛利率'],
    definition: '已支付且未退款订单中，(成交单价 - 成本价) × 数量 之和；毛利率 = 毛利 / 商品成交额（单价 × 数量之和），不扣优惠。',
    sql: `SELECT sum((i.unit_price - p.cost) * i.quantity) AS "毛利"
FROM shop.order_items i
JOIN shop.orders o ON o.id = i.order_id
JOIN shop.products p ON p.id = i.product_id
WHERE o.paid_at IS NOT NULL AND o.status <> 'refunded'`,
  },
]

/** 按关键词查找指标；没有命中时返回全部，避免模型因为措辞不同而拿不到口径 */
export function findMetrics(keywords: string[] = []): { metrics: MetricDefinition[]; note?: string } {
  const words = keywords.map((w) => w.trim().toLowerCase()).filter(Boolean)
  if (words.length === 0) return { metrics: METRICS }

  const matched = METRICS.filter((metric) => {
    const haystack = [metric.name, ...metric.aliases].join(' ').toLowerCase()
    return words.some((word) => haystack.includes(word) || word.includes(metric.name.toLowerCase()))
  })
  return matched.length > 0 ? { metrics: matched } : { metrics: METRICS, note: '没有匹配到关键词，返回全部指标口径' }
}
