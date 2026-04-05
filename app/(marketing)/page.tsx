import { HeroSection } from "@/components/marketing/hero-section";
import { ProductsSection } from "@/components/marketing/products-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { HowItWorksSection, CtaSection } from "@/components/marketing/layout-sections";

export default function LandingPage() {
    return (
        <>
            <HeroSection />
            <ProductsSection />
            <FeaturesSection />
            <HowItWorksSection />
            <CtaSection />

            {/* Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "anon.li",
                        "applicationCategory": "PrivacySecurityApplication",
                        "operatingSystem": "Web",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "USD"
                        },
                        "description": "Privacy-first email aliases and end-to-end encrypted file sharing."
                    })
                }}
            />
        </>
    )
}
