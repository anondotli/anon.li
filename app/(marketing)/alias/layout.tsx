import { Metadata } from "next";

export const metadata: Metadata = {
    title: {
        template: "%s | anon.li Alias",
        default: "anon.li Alias",
    },
};

export default function AliasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
