import { EmailLayout } from "./layout";
import {
    EmailCTA,
    EmailDivider,
    EmailHeader,
    FooterNote,
    InfoBox,
    emailColors,
} from "./primitives";

interface PaymentActionRequiredEmailProps {
    paymentUrl: string;
}

export function PaymentActionRequiredEmail({ paymentUrl }: PaymentActionRequiredEmailProps) {
    return (
        <EmailLayout
            title="Action required: complete your anon.li payment"
            preheader="Your recent payment needs an extra verification step to go through"
        >
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.warningBg}
                title="One more step to finish your payment"
                subtitle="Your bank asked for additional verification before your anon.li payment can be completed."
            />
            <InfoBox variant="warning" withBorder>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.7, color: emailColors.textMuted }}>
                    This is a normal security check (3-D Secure). Your subscription won&apos;t
                    activate until you confirm the payment.
                </p>
            </InfoBox>
            <EmailCTA href={paymentUrl} text="Complete payment" />
            <EmailDivider />
            <FooterNote>
                If you didn&apos;t make this purchase, you can safely ignore this email and no charge will be made.
            </FooterNote>
        </EmailLayout>
    );
}
