import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { ChartOption } from './specToOption'

// 按需引入：只打包折线、柱状和用到的组件，比整包 echarts 小很多
echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

export type ChartViewHandle = {
  /** 导出 PNG（2 倍分辨率、白底） */
  download: (filename: string) => void
}

/**
 * 一个组件只创建一次 ECharts 实例：配置变化时 setOption 复用实例，卸载时才销毁。
 * 流式输出期间父组件频繁重渲染，也不会反复初始化图表。
 */
export function ChartView({ option, height = 320, ref }: { option: ChartOption; height?: number; ref?: Ref<ChartViewHandle> }) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>(undefined)

  useEffect(() => {
    const instance = echarts.init(container.current!)
    chart.current = instance
    // 跟随容器宽度变化（窗口缩放、侧栏展开）重新布局
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container.current!)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = undefined
    }
  }, [])

  useEffect(() => {
    // notMerge：切换折线/柱状时整体替换，避免旧系列残留
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  useImperativeHandle(ref, () => ({
    download: (filename) => {
      const url = chart.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
      if (!url) return
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.png`
      link.click()
    },
  }))

  return <div ref={container} style={{ width: '100%', height }} />
}
