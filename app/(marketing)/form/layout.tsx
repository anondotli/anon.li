import { Metadata } from "next"

export const metadata: Metadata = {
    title: {
        template: "%s | anon.li Form",
        default: "anon.li Form",
    },
}

export default function FormLayout({ children }: { children: React.ReactNode }) {
    return children
}
