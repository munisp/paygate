import { useState } from "react";
import { AlertTriangle, MessageSquare, Upload, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DISPUTES = Array.from({length:12},(_,i)=>({
  id:`DSP-${String(i+1).padStart(4,"0")}`,
  txnId:`TXN-${String(i+100).padStart(5,"0")}`,
  customer:["Adaeze Okonkwo","Kwame Asante","Fatima Al-Rashid","Sipho Dlamini"][i%4],
  amount:Math.floor(Math.random()*200000)+10000,
  reason:["Unauthorized transaction","Item not received","Duplicate charge","Service not rendered"][i%4],
  status:i%5===0?"won":i%4===0?"lost":i%3===0?"under_review":"pending",
  deadline:new Date(Date.now()+(i+1)*86400000*3).toLocaleDateString(),
  opened:new Date(Date.now()-i*86400000).toLocaleDateString(),
}));

const statusConfig:Record<string,{cls:string;icon:any;label:string}> = {
  won:{cls:"status-success",icon:CheckCircle2,label:"Won"},
  lost:{cls:"status-failed",icon:XCircle,label:"Lost"},
  under_review:{cls:"status-pending",icon:Clock,label:"Under Review"},
  pending:{cls:"bg-blue-50 text-blue-700 border border-blue-200",icon:AlertTriangle,label:"Pending"},
};

export default function Disputes(){
  const [active,setActive]=useState<string|null>(null);

  return(
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{fontFamily:"Space Grotesk,sans-serif"}}>Disputes & Chargebacks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage and respond to payment disputes</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:"Total",value:DISPUTES.length,cls:"text-foreground"},
          {label:"Pending Response",value:DISPUTES.filter(d=>d.status==="pending").length,cls:"text-blue-600"},
          {label:"Under Review",value:DISPUTES.filter(d=>d.status==="under_review").length,cls:"text-amber-600"},
          {label:"Win Rate",value:"67%",cls:"text-emerald-600"},
        ].map(s=>(
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold ${s.cls}`} style={{fontFamily:"Space Grotesk,sans-serif"}}>{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {DISPUTES.map(d=>{
          const cfg=statusConfig[d.status]||statusConfig.pending;
          const isOpen=active===d.id;
          return(
            <div key={d.id} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/30 transition-colors" onClick={()=>setActive(isOpen?null:d.id)}>
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{d.customer}</span>
                    <span className="text-xs text-muted-foreground font-mono">{d.txnId}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold amount text-sm">₦{d.amount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Deadline: {d.deadline}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                  <cfg.icon className="w-3 h-3"/>{cfg.label}
                </span>
              </div>
              {isOpen&&(
                <div className="border-t border-border p-5 bg-muted/20 space-y-4">
                  <p className="text-sm text-muted-foreground">Dispute ID: <span className="font-mono text-foreground">{d.id}</span> · Opened: {d.opened}</p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Submit Evidence</p>
                    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors" onClick={()=>toast.info("File upload dialog would open here")}>
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2"/>
                      <p className="text-sm text-muted-foreground">Click to upload receipts, invoices, or communication logs</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Response Message</p>
                    <textarea rows={3} placeholder="Describe why this dispute should be resolved in your favor..." className="w-full px-3 py-2 text-sm bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring resize-none"/>
                  </div>
                  <div className="flex gap-3">
                    <Button size="sm" onClick={()=>{toast.success("Dispute response submitted");setActive(null);}}>
                      <MessageSquare className="w-4 h-4 mr-2"/>Submit Response
                    </Button>
                    <Button size="sm" variant="outline" onClick={()=>setActive(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
