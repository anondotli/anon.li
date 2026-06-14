/**
 * Small corner ribbon used on pricing cards (e.g. "Popular", "Teams").
 * Shared so the badge stays identical across the bundle and teams sections.
 */
export function CardRibbon({ label }: { label: string }) {
    return (
        <div className="absolute right-0 top-0 rounded-bl-xl bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {label}
        </div>
    )
}
