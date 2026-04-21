import { FeatureGate } from "@/components/FeatureGate";
import AIInsightsV2 from "./AIInsightsV2";
export default function GatedAIInsightsV2() {
  return (
    <FeatureGate feature="aiInsightsV2" requiredPlan="starter" featureName="AI Insights V2">
      <AIInsightsV2 />
    </FeatureGate>
  );
}
