import { FeatureGate } from "@/components/FeatureGate";
import WealthManagement from "./WealthManagement";

export default function GatedWealthManagement() {
  return (
    <FeatureGate feature="wealthManagement" requiredPlan="growth" featureName="Wealth Management & Goals">
      <WealthManagement />
    </FeatureGate>
  );
}
