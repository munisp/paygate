import { FeatureGate } from "@/components/FeatureGate";
import ReportsCenter from "./ReportsCenter";

export default function GatedReportsCenter() {
  return (
    <FeatureGate feature="reportsCenter" requiredPlan="starter" featureName="Reports Center">
      <ReportsCenter />
    </FeatureGate>
  );
}
