import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { getAdminFormDetail, getAdminFormSubmissions } from "@/lib/data/admin"
import { formatDateTime } from "@/lib/format"
import { FormDetailClient } from "./form-detail-client"

interface FormDetailPageProps {
    params: Promise<{ formId: string }>
}

export default async function FormDetailPage({ params }: FormDetailPageProps) {
    const { formId } = await params
    const form = await getAdminFormDetail(formId)

    if (!form) {
        notFound()
    }

    const submissions = await getAdminFormSubmissions(formId)

    return (
        <div className="space-y-6">
            <FormDetailClient form={form} />

            <Card>
                <CardHeader>
                    <CardTitle>Submissions</CardTitle>
                    <CardDescription>
                        Metadata only — submission payloads are end-to-end encrypted and cannot be read server-side.
                        Showing up to 100 most recent.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Submitted</TableHead>
                                <TableHead>Submitter</TableHead>
                                <TableHead>Attachment</TableHead>
                                <TableHead>Read</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {submissions.map((submission) => (
                                <TableRow key={submission.id}>
                                    <TableCell><code className="text-xs">{submission.id}</code></TableCell>
                                    <TableCell>{formatDateTime(submission.createdAt)}</TableCell>
                                    <TableCell>
                                        {submission.submitter ? (
                                            <Link href={`/admin/users/${submission.submitter.id}`} className="text-sm hover:underline">
                                                {submission.submitter.email}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">Anonymous</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {submission.attachedDropId ? (
                                            <Link href={`/admin/drops/${submission.attachedDropId}`} className="text-sm hover:underline">
                                                View drop
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {submission.readAt ? (
                                            <Badge variant="outline">Read</Badge>
                                        ) : (
                                            <Badge variant="secondary">Unread</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {submissions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No submissions
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
