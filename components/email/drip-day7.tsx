import { EmailLayout } from "./layout";
import {
    EmailSimpleHeader,
    EmailDivider,
    Section,
    FeatureRow,
    EmailCTAInline,
    ContentRow,
    emailTextStyles,
    FooterNote,
} from "./primitives";

interface DripDay7EmailProps {
    unsubscribeUrl?: string;
}

export function DripDay7Email({ unsubscribeUrl }: DripDay7EmailProps) {
    return (
        <EmailLayout
            title="anon.li in your browser and terminal"
            preheader="Browser extension, CLI, and an MCP server for AI agents."
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailSimpleHeader
                title="Stop tab-switching. Run anon.li from where you already are."
                subtitle="Browser extension for signup forms. CLI for scripts. MCP for Claude and ChatGPT."
            />
            <EmailDivider />

            <ContentRow>
                <p style={emailTextStyles.body}>
                    You&apos;ve been clicking through the dashboard. These shortcuts
                    collapse alias creation into one action, wherever you&apos;re working.
                </p>
            </ContentRow>

            <Section title="Three ways to skip the dashboard">
                <FeatureRow
                    icon="&#127760;"
                    title="Browser extension"
                    description="One click on any signup form to drop in a fresh alias. Chrome and Firefox."
                />
                <FeatureRow
                    icon="&#128187;"
                    title="CLI"
                    description="anon alias new &mdash; that&apos;s it. Pipe into scripts, CI, and bookmarklets."
                />
                <FeatureRow
                    icon="&#129302;"
                    title="MCP server"
                    description="Claude, ChatGPT, and other MCP clients can create aliases for you, on demand."
                    isLast
                />
            </Section>

            <EmailCTAInline href="https://anon.li/docs/cli" text="Install the CLI" />

            <FooterNote>
                All three share the same API key &mdash; find it at anon.li/dashboard/settings/api.
            </FooterNote>
        </EmailLayout>
    );
}
