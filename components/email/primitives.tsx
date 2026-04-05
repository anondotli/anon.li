/**
 * Shared Email Primitives
 *
 * Reusable components for email templates to avoid duplication.
 * All colors use solid hex values (pre-blended on #121110) for Outlook compatibility.
 * All layout uses table/td instead of div for Outlook's Word rendering engine.
 */

import React from "react";

// Solid hex palette — rgba values pre-blended on the #121110 body background
export const emailColors = {
    background: "#121110",
    text: "#faf8f5",
    textMuted: "#b4b3b0",
    textLight: "#9d9c99",
    textLighter: "#868583",
    border: "#252322",
    cardBg: "#191817",
    iconBg: "#201f1e",
    warning: "#fbbf24",
    warningBg: "#292212",
    warningBorder: "#413414",
    error: "#ef4444",
    errorBg: "#281615",
    errorBorder: "#3e1b1a",
    success: "#22c55e",
    successBg: "#142318",
    successBorder: "#153520",
    secondaryBtnBg: "#292827",
    secondaryBtnBorder: "#403f3e",
    infoBorder: "#292827",
} as const;

// Shared text styles
export const emailTextStyles = {
    heading: {
        margin: 0,
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "28px",
        fontWeight: 500,
        color: emailColors.text,
        letterSpacing: "-0.5px",
    },
    headingLarge: {
        margin: 0,
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "32px",
        fontWeight: 500,
        color: emailColors.text,
        letterSpacing: "-0.5px",
    },
    body: {
        margin: 0,
        fontSize: "15px",
        lineHeight: 1.7,
        color: emailColors.textMuted,
    },
    bodySmall: {
        margin: 0,
        fontSize: "14px",
        lineHeight: 1.7,
        color: emailColors.textLight,
    },
    label: {
        margin: "0 0 8px",
        fontSize: "13px",
        fontWeight: 600,
        color: emailColors.textLighter,
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
    },
} as const;

/**
 * Email Header with Icon
 */
interface EmailHeaderProps {
    icon: string;
    iconBgColor?: string;
    imageSrc?: string;
    title: string;
    subtitle?: React.ReactNode;
    titleSize?: "default" | "large";
}

export function EmailHeader({
    icon,
    iconBgColor = emailColors.cardBg,
    imageSrc,
    title,
    subtitle,
    titleSize = "default",
}: EmailHeaderProps) {
    return (
        <tr>
            <td style={{ padding: "48px 48px 32px", textAlign: "center" }}>
                <table role="presentation" cellSpacing="0" cellPadding="0" style={{ margin: "0 auto 24px" }}>
                    <tbody>
                        <tr>
                            <td
                                style={{
                                    width: "64px",
                                    height: "64px",
                                    backgroundColor: iconBgColor,
                                    borderRadius: "16px",
                                    textAlign: "center",
                                    verticalAlign: "middle",
                                    fontSize: "28px",
                                }}
                            >
                                {imageSrc ? (
                                    <img src={imageSrc} alt="" width="32" height="32" style={{ display: "inline-block", border: 0 }} />
                                ) : (
                                    icon
                                )}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <h1
                    style={{
                        ...(titleSize === "large" ? emailTextStyles.headingLarge : emailTextStyles.heading),
                        marginBottom: subtitle ? "16px" : 0,
                    }}
                >
                    {title}
                </h1>
                {subtitle && <p style={emailTextStyles.body}>{subtitle}</p>}
            </td>
        </tr>
    );
}

/**
 * Simple Header (no icon)
 */
interface EmailSimpleHeaderProps {
    title: string;
    subtitle?: React.ReactNode;
}

export function EmailSimpleHeader({ title, subtitle }: EmailSimpleHeaderProps) {
    return (
        <tr>
            <td style={{ padding: "48px 48px 32px", textAlign: "center" }}>
                <h1
                    style={{
                        ...emailTextStyles.headingLarge,
                        marginBottom: subtitle ? "16px" : 0,
                    }}
                >
                    {title}
                </h1>
                {subtitle && <p style={emailTextStyles.body}>{subtitle}</p>}
            </td>
        </tr>
    );
}

/**
 * Horizontal Divider
 */
export function EmailDivider() {
    return (
        <tr>
            <td style={{ padding: "0 48px" }}>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td style={{ height: "1px", backgroundColor: emailColors.border, fontSize: "1px", lineHeight: "1px" }}>
                                &nbsp;
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

/**
 * Call-to-Action Button
 */
interface EmailCTAProps {
    href: string;
    text?: string;
    children?: React.ReactNode;
    variant?: "primary" | "secondary";
}

export function EmailCTA({ href, text, children, variant = "primary" }: EmailCTAProps) {
    const isPrimary = variant === "primary";
    return (
        <tr>
            <td style={{ padding: "0 48px 48px", textAlign: "center" }}>
                <a
                    href={href}
                    style={{
                        display: "inline-block",
                        padding: "16px 40px",
                        backgroundColor: isPrimary ? emailColors.text : emailColors.secondaryBtnBg,
                        color: isPrimary ? emailColors.background : emailColors.text,
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: "14px",
                        borderRadius: "100px",
                        letterSpacing: "0.3px",
                        ...(variant === "secondary" && { border: `1px solid ${emailColors.secondaryBtnBorder}` }),
                    }}
                >
                    {children || text}
                </a>
            </td>
        </tr>
    );
}

/**
 * CTA with top padding only (for use after content sections)
 */
interface EmailCTAInlineProps {
    href: string;
    text: string;
    variant?: "primary" | "secondary";
}

export function EmailCTAInline({ href, text, variant = "primary" }: EmailCTAInlineProps) {
    const isPrimary = variant === "primary";
    return (
        <tr>
            <td style={{ padding: "16px 48px 48px", textAlign: "center" }}>
                <a
                    href={href}
                    style={{
                        display: "inline-block",
                        padding: "16px 40px",
                        backgroundColor: isPrimary ? emailColors.text : emailColors.secondaryBtnBg,
                        color: isPrimary ? emailColors.background : emailColors.text,
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: "14px",
                        borderRadius: "100px",
                        letterSpacing: "0.3px",
                        ...(variant === "secondary" && { border: `1px solid ${emailColors.secondaryBtnBorder}` }),
                    }}
                >
                    {text}
                </a>
            </td>
        </tr>
    );
}

/**
 * File/Item Info Card
 */
interface FileInfoCardProps {
    icon: string;
    iconBgColor?: string;
    imageSrc?: string;
    title: string;
    description?: React.ReactNode;
    subtitle?: React.ReactNode;
}

export function FileInfoCard({ icon, iconBgColor = emailColors.iconBg, imageSrc, title, description, subtitle }: FileInfoCardProps) {
    const descriptionContent = description || subtitle;
    return (
        <tr>
            <td style={{ padding: "0 48px 32px" }}>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td style={{ padding: "20px", backgroundColor: emailColors.cardBg, borderRadius: "16px" }}>
                                <table role="presentation" cellSpacing="0" cellPadding="0" width="100%">
                                    <tbody>
                                        <tr>
                                            <td style={{ verticalAlign: "top", width: "48px" }}>
                                                <table role="presentation" cellSpacing="0" cellPadding="0">
                                                    <tbody>
                                                        <tr>
                                                            <td
                                                                style={{
                                                                    width: "40px",
                                                                    height: "40px",
                                                                    backgroundColor: iconBgColor,
                                                                    borderRadius: "12px",
                                                                    textAlign: "center",
                                                                    verticalAlign: "middle",
                                                                    fontSize: "18px",
                                                                }}
                                                            >
                                                                {imageSrc ? (
                                                                    <img src={imageSrc} alt="" width="20" height="20" style={{ display: "inline-block", border: 0 }} />
                                                                ) : (
                                                                    icon
                                                                )}
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                            <td style={{ paddingLeft: "16px" }}>
                                                <strong style={{ color: emailColors.text, fontSize: "15px", fontWeight: 600 }}>{title}</strong>
                                                {descriptionContent && (
                                                    <p style={{ margin: "6px 0 0", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.5 }}>
                                                        {descriptionContent}
                                                    </p>
                                                )}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

/**
 * Info/Alert Box
 */
interface InfoBoxProps {
    children: React.ReactNode;
    variant?: "warning" | "error" | "success" | "info";
    withBorder?: boolean;
}

export function InfoBox({ children, variant = "info", withBorder = false }: InfoBoxProps) {
    const colors = {
        warning: { bg: emailColors.warningBg, border: emailColors.warningBorder, text: emailColors.warning },
        error: { bg: emailColors.errorBg, border: emailColors.errorBorder, text: emailColors.error },
        success: { bg: emailColors.successBg, border: emailColors.successBorder, text: emailColors.success },
        info: { bg: emailColors.cardBg, border: emailColors.infoBorder, text: emailColors.text },
    };
    const c = colors[variant];

    return (
        <tr>
            <td style={{ padding: "0 48px 24px" }}>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td
                                style={{
                                    padding: "20px",
                                    backgroundColor: c.bg,
                                    ...(withBorder && { border: `1px solid ${c.border}` }),
                                    borderRadius: "16px",
                                    textAlign: "center",
                                }}
                            >
                                {children}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

/**
 * Content Card with left border accent
 */
interface AccentCardProps {
    label?: string;
    children: React.ReactNode;
    accentColor?: string;
    bgColor?: string;
}

export function AccentCard({ label, children, accentColor = "#812b2a", bgColor = emailColors.cardBg }: AccentCardProps) {
    return (
        <tr>
            <td style={{ padding: "0 48px 32px" }}>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td
                                style={{
                                    padding: "20px",
                                    backgroundColor: bgColor,
                                    borderRadius: "16px",
                                    borderLeft: `3px solid ${accentColor}`,
                                }}
                            >
                                {label && <p style={emailTextStyles.label}>{label}</p>}
                                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.text }}>{children}</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

/**
 * Centered text content row
 */
interface ContentRowProps {
    children: React.ReactNode;
    padding?: string;
}

export function ContentRow({ children, padding = "0 48px 32px" }: ContentRowProps) {
    return (
        <tr>
            <td style={{ padding, textAlign: "center" }}>{children}</td>
        </tr>
    );
}

/**
 * Stat/Metric display box
 */
interface StatBoxProps {
    value: string | number;
    label: string;
    color?: string;
    bgColor?: string;
}

export function StatBox({ value, label, color = emailColors.success, bgColor = emailColors.successBg }: StatBoxProps) {
    return (
        <tr>
            <td style={{ padding: "0 48px 32px" }}>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td style={{ padding: "16px 20px", backgroundColor: bgColor, borderRadius: "12px", textAlign: "center" }}>
                                <span style={{ fontSize: "24px", fontWeight: 600, color }}>{value}</span>
                                <span style={{ fontSize: "14px", color: emailColors.textMuted, marginLeft: "8px" }}>{label}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

/**
 * Footer note text
 */
interface FooterNoteProps {
    children: React.ReactNode;
}

export function FooterNote({ children }: FooterNoteProps) {
    return (
        <tr>
            <td style={{ padding: "32px 48px 32px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "13px", color: emailColors.textLighter, lineHeight: 1.6 }}>{children}</p>
            </td>
        </tr>
    );
}

/**
 * Feature row with icon
 */
interface FeatureRowProps {
    icon: string;
    imageSrc?: string;
    title: string;
    description: string;
    isLast?: boolean;
}

export function FeatureRow({ icon, imageSrc, title, description, isLast = false }: FeatureRowProps) {
    return (
        <table role="presentation" width="100%" cellSpacing="0" cellPadding="0" style={{ marginBottom: isLast ? 0 : "12px" }}>
            <tbody>
                <tr>
                    <td style={{ padding: "20px", backgroundColor: emailColors.cardBg, borderRadius: "16px" }}>
                        <table role="presentation" cellSpacing="0" cellPadding="0" width="100%">
                            <tbody>
                                <tr>
                                    <td style={{ verticalAlign: "top", width: "48px" }}>
                                        <table role="presentation" cellSpacing="0" cellPadding="0">
                                            <tbody>
                                                <tr>
                                                    <td
                                                        style={{
                                                            width: "40px",
                                                            height: "40px",
                                                            backgroundColor: emailColors.iconBg,
                                                            borderRadius: "12px",
                                                            textAlign: "center",
                                                            verticalAlign: "middle",
                                                            fontSize: "18px",
                                                        }}
                                                    >
                                                        {imageSrc ? (
                                                            <img src={imageSrc} alt="" width="20" height="20" style={{ display: "inline-block", border: 0 }} />
                                                        ) : (
                                                            icon
                                                        )}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                    <td style={{ paddingLeft: "16px" }}>
                                        <strong style={{ color: emailColors.text, fontSize: "15px", fontWeight: 600 }}>{title}</strong>
                                        <p style={{ margin: "6px 0 0", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.5 }}>{description}</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

/**
 * Section with header
 */
interface SectionProps {
    title: string;
    children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
    return (
        <tr>
            <td style={{ padding: "32px 48px" }}>
                <h2
                    style={{
                        margin: "0 0 24px",
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: "20px",
                        fontWeight: 500,
                        color: emailColors.text,
                        textAlign: "center",
                    }}
                >
                    {title}
                </h2>
                {children}
            </td>
        </tr>
    );
}
