"use client"

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts"

interface BarSeriesDef {
    key: string
    label: string
    color: string
}

interface BarSeriesProps {
    data: Array<Record<string, string | number>>
    xKey: string
    series: BarSeriesDef[]
    height?: number
    stacked?: boolean
}

function formatDay(value: string) {
    const d = new Date(value)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    color: "hsl(var(--popover-foreground))",
}

/** Grouped/stacked bar chart themed with the app's CSS variables. */
export function BarSeries({ data, xKey, series, height = 280, stacked }: BarSeriesProps) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                    dataKey={xKey}
                    tickFormatter={formatDay}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    minTickGap={24}
                />
                <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    width={36}
                />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDay(String(label))} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                {series.length > 1 && <Legend wrapperStyle={{ fontSize: "0.75rem" }} />}
                {series.map((s) => (
                    <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label}
                        fill={s.color}
                        radius={[3, 3, 0, 0]}
                        stackId={stacked ? "stack" : undefined}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    )
}
