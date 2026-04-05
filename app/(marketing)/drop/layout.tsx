import { Metadata } from "next";

export const metadata: Metadata = {
    title: {
        template: "%s | anon.li Drop",
        default: "anon.li Drop",
    },
};

export default function DropLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
