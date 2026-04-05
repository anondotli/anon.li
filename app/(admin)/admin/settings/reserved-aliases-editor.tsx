"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Plus, Save } from "lucide-react"
import { toast } from "sonner"
import { getReservedAliases, updateReservedAliases } from "@/actions/admin"

export function ReservedAliasesEditor() {
    const [aliases, setAliases] = useState<string[]>([])
    const [newAlias, setNewAlias] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [originalAliases, setOriginalAliases] = useState<string[]>([])

    useEffect(() => {
        fetchAliases()
    }, [])

    const fetchAliases = async () => {
        try {
            const result = await getReservedAliases()
            if (result.error) {
                toast.error(result.error)
            } else if (result.data) {
                setAliases(result.data)
                setOriginalAliases(result.data)
            }
        } catch {
            toast.error("Failed to load reserved aliases")
        } finally {
            setLoading(false)
        }
    }

    const addAlias = () => {
        const normalized = newAlias.toLowerCase().trim()
        if (!normalized) return
        if (!/^[a-z0-9._-]+$/.test(normalized)) {
            toast.error("Invalid alias format. Use only letters, numbers, dots, hyphens, and underscores.")
            return
        }
        if (aliases.includes(normalized)) {
            toast.error("Alias already exists")
            return
        }
        setAliases([...aliases, normalized].sort())
        setNewAlias("")
        setHasChanges(true)
    }

    const removeAlias = (alias: string) => {
        setAliases(aliases.filter(a => a !== alias))
        setHasChanges(true)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await updateReservedAliases(aliases)

            if (result.error) {
                throw new Error(result.error)
            }

            if (result.data) {
                setAliases(result.data)
                setOriginalAliases(result.data)
            }
            setHasChanges(false)
            toast.success("Reserved aliases saved")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save reserved aliases")
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setAliases(originalAliases)
        setHasChanges(false)
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Reserved Aliases</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground">Loading...</div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Reserved Aliases</CardTitle>
                <CardDescription>
                    These local parts cannot be claimed by users on the primary domain.
                    Common examples: admin, support, abuse, postmaster.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        placeholder="Add reserved alias..."
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addAlias()}
                    />
                    <Button variant="outline" onClick={addAlias}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                    </Button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-[100px] p-3 border rounded-lg bg-muted/30">
                    {aliases.length === 0 ? (
                        <span className="text-muted-foreground text-sm">No reserved aliases</span>
                    ) : (
                        aliases.map((alias) => (
                            <Badge key={alias} variant="secondary" className="gap-1 pr-1">
                                {alias}
                                <button
                                    onClick={() => removeAlias(alias)}
                                    className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))
                    )}
                </div>

                {hasChanges && (
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
