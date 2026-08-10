import { FeatureGate } from "@/components/FeatureGate";
import SalaryAccounts from "./SalaryAccounts";
export default function GatedSalaryAccounts() {
  return (
    <FeatureGate feature="salaryAccounts" requiredPlan="enterprise" featureName="Salary Accounts & Payroll">
      <SalaryAccounts />
    </FeatureGate>
  );
}
