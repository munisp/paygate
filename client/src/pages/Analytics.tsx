import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

const revenueByCountry = [
  { country: "Nigeria 🇳🇬", revenue: 48200000, share: 52 },
  { country: "Kenya 🇰🇪", revenue: 18400000, share: 20 },
  { country: "Ghana 🇬🇭", revenue: 12100000, share: 13 },
  { country: "South Africa 🇿🇦", revenue: 9200000, share: 10 },
  { country: "Senegal 🇸🇳", revenue: 4600000, share: 5 },
];

const hourlyData = Array.from({length:24},(_,i)=>({
  hour:`${String(i).padStart(2,"0")}:00`,
  txns:Math.floor(Math.sin((i-6)*Math.PI/12)*400+500+Math.random()*100),
  revenue:Math.floor(Math.sin((i-6)*Math.PI/12)*2000000+2500000+Math.random()*500000),
}));

const conversionData = [
  {step:"Initiated",count:10000,rate:100},{step:"Auth",count:9200,rate:92},{step:"3DS",count:8800,rate:88},{step:"Authorized",count:8400,rate:84},{step:"Captured",count:8100,rate:81},
];

const weeklyData = Array.from({length:7},(_,i)=>{
  const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return{day:days[i],ngn:Math.floor(Math.random()*3000000)+1000000,ghs:Math.floor(Math.random()*500000)+100000,kes:Math.floor(Math.random()*800000)+200000};
});

const COLORS=["#4F46E5","#10B981","#F59E0B","#6366F1","#EC4899"];

export default function Analytics(){
  const [period,setPeriod]=useState("30d");

  return(
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{fontFamily:"Space Grotesk,sans-serif"}}>Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Deep insights into your payment performance</p>
        </div>
        <div className="flex bg-muted rounded-lg p-1 gap-1">
          {["7d","30d","90d","1y"].map(p=>(
            <button key={p} onClick={()=>setPeriod(p)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period===p?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>{p}</button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:"Avg Transaction Value",value:"₦51,852",change:+8.3,up:true},
          {label:"Authorization Rate",value:"97.3%",change:+0.8,up:true},
          {label:"Chargeback Rate",value:"0.12%",change:-0.03,up:true},
          {label:"Avg Processing Time",value:"1.2s",change:-0.3,up:true},
        ].map(m=>(
          <div key={m.label} className="stat-card">
            <p className="text-sm text-muted-foreground">{m.label}</p>
            <p className="text-2xl font-bold mt-1 amount" style={{fontFamily:"Space Grotesk,sans-serif"}}>{m.value}</p>
            <div className="flex items-center gap-1 mt-2">
              {m.up?<TrendingUp className="w-3.5 h-3.5 text-emerald-500"/>:<TrendingDown className="w-3.5 h-3.5 text-red-500"/>}
              <span className={`text-xs font-semibold ${m.up?"text-emerald-600":"text-red-600"}`}>{m.change>0?"+":""}{m.change}</span>
              <span className="text-xs text-muted-foreground">vs last period</span>
            </div>
          </div>
        ))}
      </div>

      {/* Hourly Transaction Volume */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{fontFamily:"Space Grotesk,sans-serif"}}>Hourly Transaction Volume (Today)</h3>
        <p className="text-sm text-muted-foreground mb-5">Peak hours and transaction distribution</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={hourlyData}>
            <defs>
              <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
            <XAxis dataKey="hour" tick={{fontSize:10,fill:"var(--muted-foreground)"}} axisLine={false} tickLine={false} interval={3}/>
            <YAxis tick={{fontSize:10,fill:"var(--muted-foreground)"}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}/>
            <Area type="monotone" dataKey="txns" stroke="#4F46E5" strokeWidth={2} fill="url(#hourGrad)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue by Country + Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-1" style={{fontFamily:"Space Grotesk,sans-serif"}}>Revenue by Country</h3>
          <p className="text-sm text-muted-foreground mb-5">Geographic distribution</p>
          <div className="space-y-3">
            {revenueByCountry.map((c,i)=>(
              <div key={c.country} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.country}</span>
                  <span className="font-semibold amount">₦{(c.revenue/1000000).toFixed(1)}M</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width:`${c.share}%`,background:COLORS[i]}}/>
                </div>
                <p className="text-xs text-muted-foreground text-right">{c.share}% of total</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-1" style={{fontFamily:"Space Grotesk,sans-serif"}}>Conversion Funnel</h3>
          <p className="text-sm text-muted-foreground mb-5">Payment authorization flow</p>
          <div className="space-y-2">
            {conversionData.map((step,i)=>(
              <div key={step.step} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{step.step}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground amount">{step.count.toLocaleString()}</span>
                    <span className="font-semibold w-10 text-right" style={{color:COLORS[i]}}>{step.rate}%</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width:`${step.rate}%`,background:COLORS[i]}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly Multi-Currency Revenue */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{fontFamily:"Space Grotesk,sans-serif"}}>Weekly Revenue by Currency</h3>
        <p className="text-sm text-muted-foreground mb-5">Multi-currency breakdown</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
            <XAxis dataKey="day" tick={{fontSize:12,fill:"var(--muted-foreground)"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11,fill:"var(--muted-foreground)"}} axisLine={false} tickLine={false} tickFormatter={v=>`₦${(v/1000000).toFixed(1)}M`}/>
            <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}} formatter={(v:number,name:string)=>[`₦${v.toLocaleString()}`,name.toUpperCase()]}/>
            <Bar dataKey="ngn" fill="#4F46E5" radius={[3,3,0,0]} stackId="a"/>
            <Bar dataKey="ghs" fill="#10B981" radius={[3,3,0,0]} stackId="a"/>
            <Bar dataKey="kes" fill="#F59E0B" radius={[3,3,0,0]} stackId="a"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
