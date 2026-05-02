"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTable, type Column } from "@/components/admin/data-table"
import { UserLink } from "@/components/admin/entity-link"
import { formatDateTime, formatRelativeTime } from "@/lib/admin/format"

interface SubscriptionRow {
    id: string
    provider: string
    providerSubscriptionId: string | null
    providerCustomerId: string | null
    providerPriceId: string | null
    product: string
    tier: string
    status: string
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    createdAt: Date
    user: { id: string; email: string; name: string | null; paymentMethod: string }
}

interface CryptoPaymentRow {
    id: string
    nowPaymentId: string
    invoiceId: string | null
    orderId: string
    payAmount: number
    payCurrency: string
    priceAmount: number
    priceCurrency: string
    actuallyPaid: number | null
    product: string
    tier: string
    status: string
    periodEnd: Date | null
    createdAt: Date
    user: { id: string; email: string; name: string | null }
}

interface BillingTablesProps {
    subscriptions: SubscriptionRow[]
    cryptoPayments: CryptoPaymentRow[]
    total: number
    page: number
    totalPages: number
    search: string
    status: string
}

function statusVariant(status: string) {
    return status === "active" || status === "trialing" || status === "finished" ? "default" : "outline"
}

export function BillingTables({
    subscriptions,
    cryptoPayments,
    total,
    page,
    totalPages,
    search,
    status
}: BillingTablesProps) {
    const columns: Column<SubscriptionRow>[] = [
        {
            header: "User",
            accessor: (row) => <UserLink user={row.user} />
        },
        {
            header: "Plan",
            accessor: (row) => (
                <div>
                    <div className="font-medium capitalize">{row.product} {row.tier}</div>
                    <div className="text-xs text-muted-foreground">{row.provider}</div>
                </div>
            )
        },
        {
            header: "Status",
            accessor: (row) => (
                <div className="flex flex-wrap gap-1">
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    {row.cancelAtPeriodEnd && <Badge variant="outline">Canceling</Badge>}
                </div>
            )
        },
        {
            header: "Period End",
            accessor: (row) => row.currentPeriodEnd ? formatDateTime(row.currentPeriodEnd) : <span className="text-muted-foreground">None</span>
        },
        {
            header: "Provider ID",
            accessor: (row) => row.providerSubscriptionId ? (
                <code className="text-xs">{row.providerSubscriptionId}</code>
            ) : (
                <span className="text-muted-foreground">-</span>
            )
        },
        {
            header: "Created",
            accessor: (row) => formatRelativeTime(row.createdAt)
        }
    ]

    return (
        <div className="space-y-8">
            <DataTable
                data={subscriptions}
                columns={columns}
                total={total}
                page={page}
                totalPages={totalPages}
                basePath="/admin/billing"
                search={search}
                filter={status}
                filterKey="status"
                filterOptions={[
                    { value: "all", label: "All Statuses" },
                    { value: "active", label: "Active" },
                    { value: "trialing", label: "Trialing" },
                    { value: "past_due", label: "Past due" },
                    { value: "canceled", label: "Canceled" },
                    { value: "expired", label: "Expired" },
                ]}
                searchPlaceholder="Search user, subscription, customer, or price..."
                emptyMessage="No subscriptions found"
                rowKey={(row) => row.id}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Recent Crypto Payments</CardTitle>
                    <CardDescription>Latest NOWPayments records.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cryptoPayments.map((payment) => (
                                <TableRow key={payment.id}>
                                    <TableCell><UserLink user={payment.user} /></TableCell>
                                    <TableCell className="capitalize">{payment.product} {payment.tier}</TableCell>
                                    <TableCell>
                                        {payment.payAmount} {payment.payCurrency.toUpperCase()}
                                        {payment.actuallyPaid ? (
                                            <span className="text-muted-foreground"> · paid {payment.actuallyPaid}</span>
                                        ) : null}
                                    </TableCell>
                                    <TableCell><Badge variant={statusVariant(payment.status)}>{payment.status}</Badge></TableCell>
                                    <TableCell>{formatRelativeTime(payment.createdAt)}</TableCell>
                                </TableRow>
                            ))}
                            {cryptoPayments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No crypto payments found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
