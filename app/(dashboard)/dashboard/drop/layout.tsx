import { Metadata } from "next";

export const metadata: Metadata = {
    title: {
        template: "%s | anon.li Drop",
        default: "Drop",
    },
};

export default function DropDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
