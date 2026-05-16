import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { handleBillingCron } from "@/lib/services/cron-billing";
import { handleCryptoRecoveryCron } from "@/lib/services/cron-crypto-recovery";
import { handleDomainsCron } from "@/lib/services/cron-domains";
import { handleDripCron } from "@/lib/services/cron-drip";

const logger = createLogger("CronDaily");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "daily")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const results: Record<string, unknown> = {};

    // --- Domains ---
    try {
        const domainsResult = await handleDomainsCron();
        results.domains = domainsResult;
    } catch (error) {
        logger.error("Daily cron: domains task failed", error);
        results.domains = { error: "failed" };
    }

    // --- Billing ---
    try {
        const billingResult = await handleBillingCron();
        results.billing = billingResult;
    } catch (error) {
        logger.error("Daily cron: billing task failed", error);
        results.billing = { error: "failed" };
    }

    // --- Welcome drip ---
    try {
        results.drip = await handleDripCron();
    } catch (error) {
        logger.error("Daily cron: drip task failed", error);
        results.drip = { error: "failed" };
    }

    // --- Crypto invoice recovery ---
    try {
        results.cryptoRecovery = await handleCryptoRecoveryCron();
    } catch (error) {
        logger.error("Daily cron: crypto recovery task failed", error);
        results.cryptoRecovery = { error: "failed" };
    }

    return NextResponse.json({ success: true, results });
}

export { handleCron as GET, handleCron as POST };
