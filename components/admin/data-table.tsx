"use client"

import { useState, ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"

export interface Column<T> {
    header: string
    accessor: keyof T | ((row: T) => ReactNode)
    className?: string
}

interface FilterOption {
    value: string
    label: string
}

interface DataTableProps<T> {
    data: T[]
    columns: Column<T>[]
    total: number
    page: number
    totalPages: number
    basePath: string
    search?: string
    filter?: string
    filterOptions?: FilterOption[]
    filterKey?: string
    getRowHref?: (row: T) => string
    onRowClick?: (row: T) => void
    searchPlaceholder?: string
    emptyMessage?: string
    rowKey: (row: T) => string
}

export function DataTable<T>({
    data,
    columns,
    total,
    page,
    totalPages,
    basePath,
    search = "",
    filter = "",
    filterOptions,
    filterKey = "filter",
    getRowHref,
    onRowClick,
    searchPlaceholder = "Search...",
    emptyMessage = "No results found",
    rowKey
}: DataTableProps<T>) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [searchValue, setSearchValue] = useState(search)

    const updateParams = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value && value !== "all") {
            params.set(key, value)
        } else {
            params.delete(key)
        }
        if (key !== "page") {
            params.delete("page")
        }
        router.push(`${basePath}?${params.toString()}`)
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        updateParams("search", searchValue)
    }

    const handleRowClick = (row: T) => {
        if (onRowClick) {
            onRowClick(row)
        } else if (getRowHref) {
            router.push(getRowHref(row))
        }
    }

    const isClickable = !!(onRowClick || getRowHref)

    const renderCell = (row: T, column: Column<T>) => {
        if (typeof column.accessor === "function") {
            return column.accessor(row)
        }
        const value = row[column.accessor]
        if (value === null || value === undefined) return "-"
        return String(value)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearch} className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={searchPlaceholder}
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            className="pl-9"
                            maxLength={100}
                        />
                    </div>
                    <Button type="submit" variant="secondary">Search</Button>
                </form>

                {filterOptions && (
                    <Select value={filter || "all"} onValueChange={(v) => updateParams(filterKey, v)}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="Filter" />
                        </SelectTrigger>
                        <SelectContent>
                            {filterOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="text-sm text-muted-foreground">
                Showing {data.length} of {total} results
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column, i) => (
                                <TableHead key={i} className={column.className}>
                                    {column.header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row) => (
                            <TableRow
                                key={rowKey(row)}
                                className={isClickable ? "cursor-pointer hover:bg-muted/50" : undefined}
                                onClick={() => isClickable && handleRowClick(row)}
                            >
                                {columns.map((column, i) => (
                                    <TableCell key={i} className={column.className}>
                                        {renderCell(row, column)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                        {data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => updateParams("page", String(page - 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => updateParams("page", String(page + 1))}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
