import { FeatureGate } from "@/components/FeatureGate";
import SubscriptionBillingV2 from "./SubscriptionBillingV2";
export default function GatedSubscriptionBillingV2() {
  return (
    <FeatureGate feature="subscriptionBillingV2" requiredPlan="growth" featureName="Subscription Billing V2">
      <SubscriptionBillingV2 />
    </FeatureGate>
  );
}
