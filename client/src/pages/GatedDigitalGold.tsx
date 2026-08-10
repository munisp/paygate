import { FeatureGate } from "@/components/FeatureGate";
import DigitalGold from "./DigitalGold";
export default function GatedDigitalGold() {
  return (
    <FeatureGate feature="digitalGold" requiredPlan="growth" featureName="Digital Gold & SIP Plans">
      <DigitalGold />
    </FeatureGate>
  );
}
