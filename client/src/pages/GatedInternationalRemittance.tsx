import { FeatureGate } from "@/components/FeatureGate";
import InternationalRemittance from "./InternationalRemittance";
export default function GatedInternationalRemittance() {
  return (
    <FeatureGate feature="internationalRemittance" requiredPlan="growth" featureName="International Remittance">
      <InternationalRemittance />
    </FeatureGate>
  );
}
