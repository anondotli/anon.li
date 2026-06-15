import { redirect } from "next/navigation"

export default function MaintenancePage() {
    redirect("/admin/maintenance/storage")
}
