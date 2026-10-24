-- shop：样例电商业务库，供 Agent 只读查询。由 db/seed.ts 执行（每次造数都会重建）。
-- 表和列的中文注释会被 describe_table 工具读给模型，注释写得越清楚，生成的 SQL 越准。

DROP TABLE IF EXISTS shop.reviews, shop.user_events, shop.order_items, shop.orders,
  shop.products, shop.users, shop.channels CASCADE;

CREATE TABLE shop.channels (
  id   smallint PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('organic', 'paid', 'social', 'live'))
);
COMMENT ON TABLE  shop.channels      IS '获客渠道（用户注册来源）';
COMMENT ON COLUMN shop.channels.id   IS '渠道 ID';
COMMENT ON COLUMN shop.channels.name IS '渠道名称，如 自然搜索、信息流广告、直播间';
COMMENT ON COLUMN shop.channels.type IS '渠道类型：organic=自然流量，paid=付费投放，social=社交裂变，live=直播';

CREATE TABLE shop.users (
  id            integer PRIMARY KEY,
  nickname      text NOT NULL,
  gender        text CHECK (gender IN ('M', 'F')),
  city          text NOT NULL,
  channel_id    smallint NOT NULL REFERENCES shop.channels (id),
  registered_at timestamptz NOT NULL
);
COMMENT ON TABLE  shop.users               IS '用户。新增用户按 registered_at 统计';
COMMENT ON COLUMN shop.users.id            IS '用户 ID';
COMMENT ON COLUMN shop.users.nickname      IS '昵称';
COMMENT ON COLUMN shop.users.gender        IS '性别：M=男，F=女，NULL=未填写';
COMMENT ON COLUMN shop.users.city          IS '所在城市，如 上海、北京';
COMMENT ON COLUMN shop.users.channel_id    IS '注册渠道，关联 channels.id';
COMMENT ON COLUMN shop.users.registered_at IS '注册时间';

CREATE TABLE shop.products (
  id          integer PRIMARY KEY,
  name        text NOT NULL,
  category_l1 text NOT NULL,
  category_l2 text NOT NULL,
  price       numeric(10, 2) NOT NULL,
  cost        numeric(10, 2) NOT NULL,
  created_at  timestamptz NOT NULL
);
COMMENT ON TABLE  shop.products             IS '商品';
COMMENT ON COLUMN shop.products.id          IS '商品 ID';
COMMENT ON COLUMN shop.products.name        IS '商品名称';
COMMENT ON COLUMN shop.products.category_l1 IS '一级类目：数码、服饰、美妆、食品、家居、母婴';
COMMENT ON COLUMN shop.products.category_l2 IS '二级类目，如 手机、面膜、奶粉';
COMMENT ON COLUMN shop.products.price       IS '售价（元）';
COMMENT ON COLUMN shop.products.cost        IS '成本价（元），毛利 = 售价 - 成本价';
COMMENT ON COLUMN shop.products.created_at  IS '上架时间';

CREATE TABLE shop.orders (
  id              integer PRIMARY KEY,
  user_id         integer NOT NULL REFERENCES shop.users (id),
  status          text NOT NULL CHECK (status IN ('pending_payment', 'paid', 'shipped', 'completed', 'cancelled', 'refunded')),
  total_amount    numeric(12, 2) NOT NULL,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
  pay_amount      numeric(12, 2) NOT NULL,
  created_at      timestamptz NOT NULL,
  paid_at         timestamptz,
  refunded_at     timestamptz
);
COMMENT ON TABLE  shop.orders                 IS '订单。GMV 通常按已支付订单（paid_at 不为空）的 pay_amount 统计';
COMMENT ON COLUMN shop.orders.id              IS '订单 ID';
COMMENT ON COLUMN shop.orders.user_id         IS '下单用户，关联 users.id';
COMMENT ON COLUMN shop.orders.status          IS '订单状态：pending_payment=待支付，paid=已支付待发货，shipped=已发货，completed=已完成，cancelled=已取消（未支付），refunded=已退款';
COMMENT ON COLUMN shop.orders.total_amount    IS '商品原价合计（元）';
COMMENT ON COLUMN shop.orders.discount_amount IS '优惠金额（元）';
COMMENT ON COLUMN shop.orders.pay_amount      IS '实付金额（元）= total_amount - discount_amount';
COMMENT ON COLUMN shop.orders.created_at      IS '下单时间';
COMMENT ON COLUMN shop.orders.paid_at         IS '支付时间，未支付为 NULL';
COMMENT ON COLUMN shop.orders.refunded_at     IS '退款时间，未退款为 NULL';

CREATE TABLE shop.order_items (
  id         integer PRIMARY KEY,
  order_id   integer NOT NULL REFERENCES shop.orders (id),
  product_id integer NOT NULL REFERENCES shop.products (id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10, 2) NOT NULL
);
COMMENT ON TABLE  shop.order_items            IS '订单明细，一个订单包含一到多个商品';
COMMENT ON COLUMN shop.order_items.id         IS '明细 ID';
COMMENT ON COLUMN shop.order_items.order_id   IS '所属订单，关联 orders.id';
COMMENT ON COLUMN shop.order_items.product_id IS '商品，关联 products.id';
COMMENT ON COLUMN shop.order_items.quantity   IS '购买数量';
COMMENT ON COLUMN shop.order_items.unit_price IS '成交单价（元）';

CREATE TABLE shop.user_events (
  id          bigint PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES shop.users (id),
  event_type  text NOT NULL CHECK (event_type IN ('visit', 'view_product', 'add_cart', 'place_order', 'pay')),
  product_id  integer REFERENCES shop.products (id),
  occurred_at timestamptz NOT NULL
);
COMMENT ON TABLE  shop.user_events             IS '用户行为事件，用于漏斗和转化分析。下单转化率通常 = 当天有 place_order 的用户数 / 当天有 visit 的用户数';
COMMENT ON COLUMN shop.user_events.id          IS '事件 ID';
COMMENT ON COLUMN shop.user_events.user_id     IS '用户，关联 users.id';
COMMENT ON COLUMN shop.user_events.event_type  IS '事件类型：visit=访问，view_product=浏览商品，add_cart=加入购物车，place_order=下单，pay=支付';
COMMENT ON COLUMN shop.user_events.product_id  IS '相关商品，仅 view_product 和 add_cart 有值';
COMMENT ON COLUMN shop.user_events.occurred_at IS '发生时间';

CREATE TABLE shop.reviews (
  id         integer PRIMARY KEY,
  order_id   integer NOT NULL REFERENCES shop.orders (id),
  product_id integer NOT NULL REFERENCES shop.products (id),
  user_id    integer NOT NULL REFERENCES shop.users (id),
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content    text NOT NULL,
  created_at timestamptz NOT NULL
);
COMMENT ON TABLE  shop.reviews            IS '商品评价';
COMMENT ON COLUMN shop.reviews.id         IS '评价 ID';
COMMENT ON COLUMN shop.reviews.order_id   IS '所属订单，关联 orders.id';
COMMENT ON COLUMN shop.reviews.product_id IS '被评价的商品，关联 products.id';
COMMENT ON COLUMN shop.reviews.user_id    IS '评价用户，关联 users.id';
COMMENT ON COLUMN shop.reviews.rating     IS '评分 1-5，5 为最好';
COMMENT ON COLUMN shop.reviews.content    IS '评价内容（用户输入的自由文本）';
COMMENT ON COLUMN shop.reviews.created_at IS '评价时间';

CREATE INDEX ON shop.users (registered_at);
CREATE INDEX ON shop.users (channel_id);
CREATE INDEX ON shop.orders (created_at);
CREATE INDEX ON shop.orders (user_id);
CREATE INDEX ON shop.order_items (order_id);
CREATE INDEX ON shop.order_items (product_id);
CREATE INDEX ON shop.user_events (occurred_at);
CREATE INDEX ON shop.user_events (user_id);
CREATE INDEX ON shop.reviews (product_id);
