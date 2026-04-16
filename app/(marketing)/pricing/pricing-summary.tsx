import { getPublicPricingCatalog, type PublicPricingPlan } from "@/lib/public-pricing"

const usdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
})

function formatUsd(value: number) {
    if (value === 0) return "Free"
    return usdFormatter.format(value)
}

function monthlyPrice(plan: PublicPricingPlan) {
    if (plan.prices.monthly === 0) return "Free"
    return `${formatUsd(plan.prices.monthly)} per month`
}

function yearlyPrice(plan: PublicPricingPlan) {
    if (plan.prices.yearly === 0) return "Free"

    return `${formatUsd(plan.prices.yearly)} per year (${formatUsd(plan.prices.yearlyEquivalentMonthly)} per month equivalent)`
}

export function PricingSummary() {
    const catalog = getPublicPricingCatalog()

    return (
        <section className="bg-secondary/20 py-16" aria-labelledby="complete-pricing-summary">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="mb-10 max-w-3xl">
                    <h2 id="complete-pricing-summary" className="text-3xl md:text-4xl font-serif font-medium text-primary">
                        Complete plan summary
                    </h2>
                    <p className="mt-3 text-muted-foreground leading-relaxed">
                        All prices are in USD. Yearly billing is charged once per year; the monthly equivalent is shown for comparison.
                    </p>
                </div>

                <div className="space-y-12">
                    {catalog.products.map((product) => (
                        <section key={product.id} aria-labelledby={`${product.id}-pricing-summary`}>
                            <div className="mb-4">
                                <h3 id={`${product.id}-pricing-summary`} className="text-2xl font-serif font-medium text-primary">
                                    {product.name}
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                            </div>

                            <div className="overflow-x-auto border border-border/60 bg-background">
                                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                                    <caption className="sr-only">{product.name} pricing plans and included features</caption>
                                    <thead>
                                        <tr className="border-b border-border/60 bg-secondary/40">
                                            <th scope="col" className="w-[18%] px-4 py-3 font-medium text-primary">Plan</th>
                                            <th scope="col" className="w-[18%] px-4 py-3 font-medium text-primary">Monthly</th>
                                            <th scope="col" className="w-[28%] px-4 py-3 font-medium text-primary">Yearly</th>
                                            <th scope="col" className="px-4 py-3 font-medium text-primary">Included</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {product.plans.map((plan) => (
                                            <tr key={plan.id} className="border-b border-border/40 last:border-b-0 align-top">
                                                <th scope="row" className="px-4 py-4 font-medium text-primary">
                                                    <span className="block">{plan.name}</span>
                                                    <span className="block pt-1 text-xs font-normal text-muted-foreground">
                                                        {plan.description}
                                                    </span>
                                                </th>
                                                <td className="px-4 py-4 text-muted-foreground">
                                                    <data value={String(plan.prices.monthly)}>{monthlyPrice(plan)}</data>
                                                </td>
                                                <td className="px-4 py-4 text-muted-foreground">
                                                    <data value={String(plan.prices.yearly)}>{yearlyPrice(plan)}</data>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="space-y-4">
                                                        {plan.featureGroups.map((group) => (
                                                            <div key={group.name}>
                                                                <p className="mb-2 font-medium text-primary">{group.name}</p>
                                                                <ul className="grid gap-1 text-muted-foreground md:grid-cols-2">
                                                                    {group.included.map((feature) => (
                                                                        <li key={feature}>{feature}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </section>
    )
}
