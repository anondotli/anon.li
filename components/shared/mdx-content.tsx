import * as React from "react"
import { MDXRemote } from "next-mdx-remote/rsc"
import { cn } from "@/lib/utils"
import { AlertCircle, Info, AlertTriangle, CheckCircle2, Terminal } from "lucide-react"

interface VideoProps {
    src: string
    title: string
    poster?: string
}

function Video({ src, title, poster }: VideoProps) {
    return (
        <figure className="not-prose my-10 overflow-hidden rounded-2xl border border-border/60 bg-black shadow-sm">
            <video
                className="block aspect-video h-auto w-full"
                controls
                playsInline
                preload="metadata"
                poster={poster}
            >
                <source src={src} />
                Your browser does not support HTML5 video playback.
            </video>
            <figcaption className="sr-only">{title}</figcaption>
        </figure>
    )
}

// Callout component for notes, warnings, etc.
interface CalloutProps {
    type?: "info" | "warning" | "error" | "success" | "note"
    title?: string
    children: React.ReactNode
}

function Callout({ type = "info", title, children }: CalloutProps) {
    const styles = {
        info: {
            container: "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-100",
            icon: Info,
            iconColor: "text-blue-500",
        },
        warning: {
            container: "bg-yellow-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-100",
            icon: AlertTriangle,
            iconColor: "text-yellow-500",
        },
        error: {
            container: "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-100",
            icon: AlertCircle,
            iconColor: "text-red-500",
        },
        success: {
            container: "bg-green-500/10 border-green-500/30 text-green-900 dark:text-green-100",
            icon: CheckCircle2,
            iconColor: "text-green-500",
        },
        note: {
            container: "bg-secondary/50 border-border text-foreground",
            icon: Info,
            iconColor: "text-muted-foreground",
        },
    }

    const { container, icon: Icon, iconColor } = styles[type]

    return (
        <div className={cn("my-6 flex gap-3 rounded-xl border p-4", container)}>
            <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconColor)} />
            <div className="flex-1 space-y-1">
                {title && <p className="font-medium text-sm">{title}</p>}
                <div className="text-sm [&>p]:m-0">{children}</div>
            </div>
        </div>
    )
}

// Step component for tutorials
interface StepProps {
    step: number
    title: string
    children: React.ReactNode
}

function Step({ step, title, children }: StepProps) {
    return (
        <div className="not-prose my-8 flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {step}
            </div>
            <div className="flex-1 pt-0.5">
                <h4 className="font-medium mb-2">{title}</h4>
                <div className="text-muted-foreground [&>p]:m-0">{children}</div>
            </div>
        </div>
    )
}

const components = {
    h1: (props: React.ComponentProps<"h1">) => (
        <h1
            className="mt-2 scroll-m-20 text-4xl font-bold tracking-tight font-serif"
            {...props}
        />
    ),
    h2: (props: React.ComponentProps<"h2">) => {
        const id = typeof props.children === 'string'
            ? props.children.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
            : undefined
        return (
            <h2
                id={id}
                className="mt-12 scroll-m-24 border-b pb-2 text-2xl font-semibold first:mt-0 font-serif"
                {...props}
            />
        )
    },
    h3: (props: React.ComponentProps<"h3">) => {
        const id = typeof props.children === 'string'
            ? props.children.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
            : undefined
        return (
            <h3
                id={id}
                className="mt-8 scroll-m-24 text-xl font-serif"
                {...props}
            />
        )
    },
    h4: (props: React.ComponentProps<"h4">) => (
        <h4
            className="mt-8 scroll-m-20 text-lg font-semibold tracking-tight font-serif"
            {...props}
        />
    ),
    h5: (props: React.ComponentProps<"h5">) => (
        <h5
            className="mt-8 scroll-m-20 text-base font-semibold tracking-tight font-serif"
            {...props}
        />
    ),
    h6: (props: React.ComponentProps<"h6">) => (
        <h6
            className="mt-8 scroll-m-20 text-sm font-semibold tracking-tight font-serif"
            {...props}
        />
    ),
    a: (props: React.ComponentProps<"a">) => (
        <a
            className="font-medium text-primary underline underline-offset-4 decoration-primary/30 hover:decoration-primary transition-colors"
            {...props}
        />
    ),
    p: (props: React.ComponentProps<"p">) => (
        <p className="leading-7 [&:not(:first-child)]:mt-6" {...props} />
    ),
    ul: (props: React.ComponentProps<"ul">) => (
        <ul className="my-6 ml-6 list-disc [&>li]:mt-2 marker:text-muted-foreground" {...props} />
    ),
    ol: (props: React.ComponentProps<"ol">) => (
        <ol className="my-6 ml-6 list-decimal [&>li]:mt-2 marker:text-muted-foreground" {...props} />
    ),
    li: (props: React.ComponentProps<"li">) => (
        <li className="leading-7" {...props} />
    ),
    blockquote: (props: React.ComponentProps<"blockquote">) => (
        <blockquote
            className="mt-6 border-l-2 border-primary/30 pl-6 italic text-muted-foreground [&>p]:m-0"
            {...props}
        />
    ),
    hr: (props: React.ComponentProps<"hr">) => (
        <hr className="my-8 border-border/50" {...props} />
    ),
    table: (props: React.ComponentProps<"table">) => (
        <div className="my-6 w-full overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" {...props} />
        </div>
    ),
    tr: (props: React.ComponentProps<"tr">) => (
        <tr className="border-b border-border last:border-0" {...props} />
    ),
    th: (props: React.ComponentProps<"th">) => (
        <th
            className="bg-secondary/50 px-4 py-3 text-left font-medium [&[align=center]]:text-center [&[align=right]]:text-right"
            {...props}
        />
    ),
    td: (props: React.ComponentProps<"td">) => (
        <td
            className="px-4 py-3 text-left [&[align=center]]:text-center [&[align=right]]:text-right"
            {...props}
        />
    ),
    pre: (props: React.ComponentProps<"pre">) => (
        <div className="group relative my-6">
            <div className="absolute right-3 top-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-1 text-xs text-muted-foreground">
                    <Terminal className="h-3 w-3" />
                    <span>Code</span>
                </div>
            </div>
            <pre
                className="overflow-x-auto rounded-xl border border-border bg-[#0d1117] dark:bg-[#0d1117] p-4 text-sm leading-relaxed text-[#e5e7eb]"
                {...props}
            />
        </div>
    ),
    code: (props: React.ComponentProps<"code">) => {
        // Check if it's inline code (not inside a pre block)
        const isInline = typeof props.children === 'string' && !props.children.includes('\n')
        if (isInline) {
            return (
                <code
                    className="relative rounded-md bg-secondary/80 px-[0.4rem] py-[0.2rem] font-mono text-sm text-primary"
                    {...props}
                />
            )
        }
        return (
            <code
                className="relative font-mono text-sm text-gray-200"
                {...props}
            />
        )
    },
    img: (props: React.ComponentProps<"img">) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            className="rounded-xl border border-border my-8"
            alt={props.alt || ""}
            {...props}
        />
    ),
    // Custom components
    Callout,
    Step,
    Video,
}

import remarkGfm from "remark-gfm"

export function MDXContent({ source }: { source: string }) {
    return (
        <MDXRemote
            source={source}
            components={components}
            options={{
                mdxOptions: {
                    remarkPlugins: [remarkGfm],
                },
            }}
        />
    )
}
