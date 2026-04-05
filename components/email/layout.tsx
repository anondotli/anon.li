/* eslint-disable @next/next/no-head-element */
/* eslint-disable @next/next/no-img-element */
import { EMAIL_FONT_STYLES, emailStyles } from "./styles";

interface EmailLayoutProps {
    children: React.ReactNode;
    title: string;
    preheader?: string;
}

// Invisible whitespace filler to stop email clients showing body text after preheader
const PREHEADER_SPACER = "\u200C\u00A0\u200C\u00A0".repeat(75);

export function EmailLayout({ children, title, preheader }: EmailLayoutProps) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta name="color-scheme" content="dark" />
                <meta name="supported-color-schemes" content="dark" />
                <title>{title}</title>
                <style dangerouslySetInnerHTML={{ __html: EMAIL_FONT_STYLES }} />
            </head>
            <body style={{ margin: 0, padding: 0, ...emailStyles.main }}>
                {preheader && (
                    <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                        <tbody>
                            <tr>
                                <td style={{
                                    display: "none",
                                    fontSize: "1px",
                                    color: "#121110",
                                    lineHeight: "1px",
                                    maxHeight: 0,
                                    maxWidth: 0,
                                    opacity: 0,
                                    overflow: "hidden",
                                    msoHide: "all",
                                } as React.CSSProperties}>
                                    {preheader}
                                    {PREHEADER_SPACER}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                )}
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0" style={{ backgroundColor: "#121110" }}>
                    <tbody>
                        <tr>
                            <td align="center" style={{ padding: "60px 20px" }}>
                                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0" style={{ maxWidth: "560px" }}>
                                    {/* Logo */}
                                    <tbody>
                                        <tr>
                                            <td style={{ textAlign: "center", paddingBottom: "40px" }}>
                                                <table role="presentation" cellSpacing="0" cellPadding="0" style={emailStyles.logoTable}>
                                                    <tbody>
                                                        <tr>
                                                            <td style={{ verticalAlign: "middle" }}>
                                                                <img
                                                                    src="https://anon.li/favicon-32x32.png"
                                                                    alt="logo"
                                                                    width="28"
                                                                    height="28"
                                                                    style={{ display: "block", border: 0 }}
                                                                />
                                                            </td>
                                                            <td style={{ verticalAlign: "middle", paddingLeft: "10px" }}>
                                                                <span style={emailStyles.logoText}>anon.li</span>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>

                                        {/* Main Content Card */}
                                        <tr>
                                            <td>
                                                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0" style={emailStyles.card}>
                                                    <tbody>
                                                        {children}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>

                                        {/* Footer */}
                                        <tr>
                                            <td style={{ padding: "32px 20px", textAlign: "center" }}>
                                                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#7f7c7a" }}>
                                                    <a href="https://anon.li/docs" style={{ color: "#7f7c7a", textDecoration: "none" }}>Documentation</a>
                                                    &nbsp;&middot;&nbsp;
                                                    <a href="https://anon.li/faq" style={{ color: "#7f7c7a", textDecoration: "none" }}>FAQ</a>
                                                    &nbsp;&middot;&nbsp;
                                                    <a href="https://anon.li/docs/legal/aup" style={{ color: "#7f7c7a", textDecoration: "none" }}>Policies</a>
                                                </p>
                                                <p style={emailStyles.footerText}>
                                                    anon.li &mdash; Privacy tools that respect you.
                                                </p>
                                                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#555352" }}>
                                                    You&apos;re receiving this because you have an anon.li account or interacted with our service.
                                                </p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </body>
        </html>
    );
}
