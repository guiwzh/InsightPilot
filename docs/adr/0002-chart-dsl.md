# 0002 图表用 DSL，不让模型写代码

**背景**：Generative UI 有两条路：让模型直接生成 React / HTML / ECharts 配置，或者让模型填一个结构固定的描述。

**决定**：模型只调用 `render_chart`，填一个扁平的 Zod schema（type、x、y、series、stacked、horizontal、title、resultId），前端用纯函数 `specToOption` 转成 ECharts 配置。

**理由**
- **安全**：模型输出不会被当成代码执行，没有 XSS 和任意代码执行的风险。
- **可控**：样式统一，不会每次长得不一样。
- **可校验、可评测**：服务端检查列名是否存在、y 是否是数值列，不对就把可用列返回给模型让它改；评测里能统计"图表一次成功率"（实测 100%）。
- **数据不经过模型**：DSL 只描述"哪一列画在哪"，数据由前端按 resultId 拉取。

**一个坑**：最初用 `z.discriminatedUnion` 按图表类型区分字段，DeepSeek 直接拒绝了这个工具，因为它要求工具参数的 JSON Schema 顶层必须是 `type: "object"`。改成扁平对象，"line、bar 必须有 x、y"挪到校验函数里。

**代价 / 何时推翻**：表达能力有限（目前只有折线、柱状、表格）。需要更多图表类型时扩展 DSL；需要完全自由的布局时，可以考虑 MCP Apps 这类在沙箱 iframe 里渲染的方案。
