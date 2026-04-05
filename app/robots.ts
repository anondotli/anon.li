import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/dashboard/", "/api/"],
        },
        sitemap: "https://anon.li/sitemap.xml",
    }
}
