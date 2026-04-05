import 'stripe';

declare module 'stripe' {
    namespace Stripe {
        interface Subscription {
            current_period_end: number;
        }

        interface Invoice {
            subscription: string | Stripe.Subscription | null;
        }
    }
}
