import { Metadata } from "next";

export const metadata: Metadata = {
    title: {
        template: "%s | anon.li Alias",
        default: "Alias",
    },
};

export default function AliasDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
