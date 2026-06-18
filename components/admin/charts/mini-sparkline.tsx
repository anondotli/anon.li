"use client"

import { useId } from "react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"

interface MiniSparklineProps {
    /** Series of numeric values, oldest → newest. */
    values: number[]
    color?: string
    height?: number
}

/** Tiny axis-less area chart for embedding inside KPI stat cards. */
export function MiniSparkline({ values, color = "hsl(var(--foreground))", height = 40 }: MiniSparklineProps) {
    const data = values.map((value, i) => ({ i, value }))
    const gradientId = `spark${useId().replace(/:/g, "")}`

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    )
}
