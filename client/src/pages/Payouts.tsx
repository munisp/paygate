import { useState } from "react";
import { ArrowUpRight, Plus, Download, Clock, CheckCircle2, XCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PAYOUTS = Array.from({length:20},(_,i)=>({
  id:`PO-${String(i+1).padStart(4,"0")}`,
  bank:["Access Bank","GTBank","Zenith Bank","First Bank","UBA"][i%5],
  account:`0${Math.floor(Math.random()*9000000000+1000000000)}`,
  amount:Math.floor(Math.random()*5000000)+100000,
  status:i%6===0?"failed":i%4===0?"pending":"success",
  date:new Date(Date.now()-i*86400000*2).toLocaleDateString(),
  narration:"Settlement for transactions",
}));

export default function Payouts(){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({bank:"",account:"",amount:"",narration:""});

  const handleSubmit=(e:React.FormEvent)=>{
    e.preventDefault();
    toast.success(`Payout of ₦${Number(form.amount).toLocaleString()} initiated to ${form.bank}`);
    setShowForm(false);
    setForm({bank:"",account:"",amount:"",narration:""});
  };

  return(
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{fontFamily:"Space Grotesk,sans-serif"}}>Payouts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Transfer funds to your bank accounts</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={()=>toast.success("Exported")}><Download className="w-4 h-4 mr-2"/>Export</Button>
          <Button size="sm" onClick={()=>setShowForm(true)}><Plus className="w-4 h-4 mr-2"/>New Payout</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{label:"Total Paid Out",value:"₦48.2M",cls:"text-foreground"},{label:"Successful",value:PAYOUTS.filter(p=>p.status==="success").length,cls:"text-emerald-600"},{label:"Pending",value:PAYOUTS.filter(p=>p.status==="pending").length,cls:"text-amber-600"},{label:"Failed",value:PAYOUTS.filter(p=>p.status==="failed").length,cls:"text-red-600"}].map(s=>(
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold ${s.cls}`} style={{fontFamily:"Space Grotesk,sans-serif"}}>{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {showForm&&(
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-4" style={{fontFamily:"Space Grotesk,sans-serif"}}>Initiate Payout</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">Bank Name</label>
              <select value={form.bank} onChange={e=>setForm(p=>({...p,bank:e.target.value}))} required className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select bank</option>
                {["Access Bank","GTBank","Zenith Bank","First Bank","UBA"].map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div><label className="text-sm font-medium">Account Number</label>
              <input value={form.account} onChange={e=>setForm(p=>({...p,account:e.target.value}))} required placeholder="0000000000" className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono"/>
            </div>
            <div><label className="text-sm font-medium">Amount (NGN)</label>
              <input value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} required type="number" placeholder="100000" className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"/>
            </div>
            <div><label className="text-sm font-medium">Narration</label>
              <input value={form.narration} onChange={e=>setForm(p=>({...p,narration:e.target.value}))} placeholder="Settlement payment" className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"/>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit">Initiate Payout</Button>
              <Button type="button" variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-border bg-muted/30">
            {["ID","Bank","Account","Amount","Status","Date","Narration"].map(h=>(
              <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {PAYOUTS.map(p=>(
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-primary">{p.id}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground"/><span className="text-sm">{p.bank}</span></div></td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{p.account}</td>
                <td className="px-4 py-3 text-sm font-semibold amount">₦{p.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.status==="success"?"status-success":p.status==="pending"?"status-pending":"status-failed"}`}>
                    {p.status==="success"?<CheckCircle2 className="w-3 h-3"/>:p.status==="pending"?<Clock className="w-3 h-3"/>:<XCircle className="w-3 h-3"/>}
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.date}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.narration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
