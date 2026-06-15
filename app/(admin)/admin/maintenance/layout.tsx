import { PageHeader } from "@/components/admin/page-header"
import { MaintenanceTabs } from "./maintenance-tabs"

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-8">
            <PageHeader
                title="Maintenance"
                description="Storage cleanup backlog and failed account-deletion retries."
            />
            <MaintenanceTabs />
            {children}
        </div>
    )
}
