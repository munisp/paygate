import { FeatureGate } from "@/components/FeatureGate";
import NodalAccounts from "./NodalAccounts";
export default function GatedNodalAccounts() {
  return (
    <FeatureGate feature="nodalAccounts" requiredPlan="enterprise" featureName="Nodal Accounts">
      <NodalAccounts />
    </FeatureGate>
  );
}
