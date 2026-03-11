import { useState } from "react";
import { Search, UserPlus, Download, Mail, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CUSTOMERS = Array.from({ length: 40 }, (_, i) => {
  const names = ["Adaeze Okonkwo","Kwame Asante","Fatima Al-Rashid","Sipho Dlamini","Amara Diallo","Chidi Eze","Naledi Mokoena","Emeka Obi","Aisha Bello","Kofi Mensah"];
  const countries = ["Nigeria","Ghana","Kenya","South Africa","Senegal"];
  const flags = ["🇳🇬","🇬🇭","🇰🇪","🇿🇦","🇸🇳"];
  const tiers = ["Standard","Premium","Enterprise"];
  const n = names[i % names.length];
  const c = i % countries.length;
  return {
    id: `CUS-${String(i+1).padStart(4,"0")}`,
    name: n,
    email: `${n.split(" ")[0].toLowerCase()}@example.com`,
    phone: `+${234 + i * 3}${Math.floor(Math.random()*9000000000+1000000000)}`,
    country: countries[c],
    flag: flags[c],
    tier: tiers[i % 3],
    transactions: Math.floor(Math.random()*200)+5,
    totalSpent: Math.floor(Math.random()*5000000)+50000,
    lastSeen: `${Math.floor(Math.random()*30)+1}d ago`,
    status: i % 8 === 0 ? "blocked" : "active",
  };
});

export default function Customers() {
  const [search, setSearch] = useState("");
  const filtered = CUSTOMERS.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{fontFamily:"Space Grotesk,sans-serif"}}>Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{CUSTOMERS.length} registered customers</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => toast.success("Exported customer list")}><Download className="w-4 h-4 mr-2"/>Export</Button>
          <Button size="sm" onClick={() => toast.info("Customer invite sent")}><UserPlus className="w-4 h-4 mr-2"/>Invite Customer</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{label:"Total",value:CUSTOMERS.length,cls:"text-foreground"},{label:"Active",value:CUSTOMERS.filter(c=>c.status==="active").length,cls:"text-emerald-600"},{label:"Premium",value:CUSTOMERS.filter(c=>c.tier==="Premium").length,cls:"text-indigo-600"},{label:"Enterprise",value:CUSTOMERS.filter(c=>c.tier==="Enterprise").length,cls:"text-amber-600"}].map(s=>(
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold ${s.cls}`} style={{fontFamily:"Space Grotesk,sans-serif"}}>{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customers..." className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"/>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-border bg-muted/30">
            {["Customer","Contact","Country","Tier","Transactions","Total Spent","Last Seen","Status"].map(h=>(
              <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {filtered.map(c=>(
              <tr key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={()=>toast.info(`Viewing ${c.name}`)}>
                <td className="px-4 py-3"><div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground font-mono">{c.id}</p></div></td>
                <td className="px-4 py-3"><div className="flex flex-col gap-0.5"><span className="text-xs flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3"/>{c.email}</span><span className="text-xs flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3"/>{c.phone}</span></div></td>
                <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-sm"><span>{c.flag}</span>{c.country}</span></td>
                <td className="px-4 py-3"><Badge variant="secondary" className={`text-xs ${c.tier==="Enterprise"?"bg-amber-50 text-amber-700":c.tier==="Premium"?"bg-indigo-50 text-indigo-700":"bg-muted text-muted-foreground"}`}>{c.tier}</Badge></td>
                <td className="px-4 py-3 text-sm amount">{c.transactions}</td>
                <td className="px-4 py-3 text-sm font-semibold amount">₦{c.totalSpent.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastSeen}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.status==="active"?"status-success":"status-failed"}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
