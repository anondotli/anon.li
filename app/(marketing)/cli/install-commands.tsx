"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
    {
        id: "linux",
        label: "Linux / macOS",
        command: "curl -fsSL https://anon.li/cli/install.sh | bash",
    },
    {
        id: "windows",
        label: "Windows",
        command: "irm https://anon.li/cli/install.ps1 | iex",
    },
    {
        id: "npm",
        label: "npm",
        command: "npm install -g anonli",
    },
]

export function InstallCommands() {
    const [activeTab, setActiveTab] = useState("linux")
    const [copied, setCopied] = useState(false)

    const active = tabs.find((t) => t.id === activeTab)!

    function handleCopy() {
        navigator.clipboard.writeText(active.command)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl overflow-hidden shadow-lg">
                {/* Tabs */}
                <div className="flex border-b border-border/40">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setCopied(false) }}
                            className={cn(
                                "flex-1 px-4 py-3 text-sm font-medium transition-colors relative",
                                activeTab === tab.id
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.id && (
                                <span className="absolute bottom-0 left-0 right-0 h-px bg-primary" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Command */}
                <div className="group relative p-5 flex items-center justify-between gap-4">
                    <code className="font-mono text-sm text-primary/90 select-all truncate">
                        {active.command}
                    </code>
                    <button
                        onClick={handleCopy}
                        className="flex-shrink-0 p-2 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy command"
                    >
                        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    )
}
