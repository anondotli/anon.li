export const EMAIL_FONT_STYLES = `
    @font-face {
        font-family: 'Geist';
        src: url('https://anon.li/fonts/latin-400-normal.woff2') format('woff2');
        font-weight: 400;
        font-style: normal;
    }
    @font-face {
        font-family: 'Geist';
        src: url('https://anon.li/fonts/latin-600-normal.woff2') format('woff2');
        font-weight: 600;
        font-style: normal;
    }
    @font-face {
        font-family: 'Playfair Display';
        src: url('https://anon.li/fonts/latin-500-normal.woff2') format('woff2');
        font-weight: 500;
        font-style: normal;
    }
    a:not([style*="background-color"]) {
        color: inherit;
        text-decoration: none;
    }
`;

export const emailStyles = {
    main: {
        backgroundColor: "#121110",
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: "#faf8f5",
    },
    logoTable: {
        margin: "0 auto",
    },
    logoText: {
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "26px",
        fontWeight: 500,
        color: "#faf8f5",
        letterSpacing: "-0.5px",
    },
    card: {
        backgroundColor: "#181716",
        background: "linear-gradient(180deg, #1a1918 0%, #151413 100%)",
        borderRadius: "24px",
        border: "1px solid #252322",
        overflow: "hidden",
        width: "100%",
    },
    footerText: {
        margin: 0,
        fontSize: "13px",
        color: "#6f6d6c",
    },
    link: {
        color: "#7f7c7a",
        textDecoration: "none",
    },
    button: {
        display: "inline-block",
        padding: "16px 40px",
        backgroundColor: "#faf8f5",
        color: "#121110",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "14px",
        borderRadius: "100px",
        letterSpacing: "0.3px",
    }
} as const;
