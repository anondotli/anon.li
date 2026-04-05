import { PageHeader } from "@/components/admin/page-header"
import { ReservedAliasesEditor } from "./reserved-aliases-editor"

export default async function SettingsPage() {
    return (
        <div className="space-y-8">
            <PageHeader
                title="Settings"
                description="System configuration and reserved resources."
            />
            <ReservedAliasesEditor />
        </div>
    )
}
