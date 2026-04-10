import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, Calendar, Plus, Play } from "lucide-react";
export default function PayrollV3() {
  const employees = [
    { id: "e1", name: "Chidi Okeke", department: "Engineering", grossSalary: 850000, netSalary: 680000, status: "active" },
    { id: "e2", name: "Amina Garba", department: "Finance", grossSalary: 650000, netSalary: 520000, status: "active" },
    { id: "e3", name: "Seun Adewale", department: "Sales", grossSalary: 450000, netSalary: 360000, status: "active" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Payroll V3</h1><p className="text-muted-foreground">Multi-entity payroll with pension and tax integration</p></div>
        <div className="flex gap-2"><Button variant="outline"><Plus className="w-4 h-4 mr-2" />Add Employee</Button><Button><Play className="w-4 h-4 mr-2" />Run Payroll</Button></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">45</p><p className="text-sm text-muted-foreground">Employees</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">28.5M</p><p className="text-sm text-muted-foreground">Monthly Payroll</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Calendar className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">Apr 28</p><p className="text-sm text-muted-foreground">Next Pay Date</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Employee List</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{employees.map(e => (
          <div key={e.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{e.name}</p><p className="text-sm text-muted-foreground">{e.department}</p></div>
            <div className="flex items-center gap-4">
              <p className="font-medium">{(e.grossSalary/100).toLocaleString()} gross</p>
              <p className="font-medium text-green-600">{(e.netSalary/100).toLocaleString()} net</p>
              <Badge>{e.status}</Badge>
              <Button size="sm" variant="outline">Payslip</Button>
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
