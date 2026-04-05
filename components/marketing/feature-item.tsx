import { Check, X } from "lucide-react"

interface FeatureItemProps {
    included: boolean
    text: string
}

export function FeatureItem({ included, text }: FeatureItemProps) {
    return (
        <li className={`flex items-start gap-3 ${!included ? "text-muted-foreground/50" : ""}`}>
            {included ? (
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            ) : (
                <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            )}
            <span className={`font-light ${!included ? "line-through decoration-muted-foreground/30" : ""}`}>{text}</span>
        </li>
    )
}
