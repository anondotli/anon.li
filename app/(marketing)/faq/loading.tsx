import { LogoLoader } from "@/components/ui/logo-loader"

export default function Loading() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 animate-in fade-in duration-500">
            <LogoLoader size="lg" />
        </div>
    )
}
