import { useState, useEffect, useRef } from "react";
import {
  Train, MapPin, Navigation, Bell, Clock, AlertTriangle,
  RefreshCw, Users, Zap, ArrowRight, CheckCircle, XCircle,
  Info, ArrowUpDown, Loader, ChevronDown, Accessibility,
  Radio, Bus
} from "lucide-react";

const T = {
  red:"#dc2626",redGlow:"rgba(220,38,38,0.25)",redDim:"rgba(220,38,38,0.09)",
  bg:"#0a0a0a",surface:"#111111",surface2:"#161616",surface3:"#1c1c1c",
  border:"#1f1f1f",border2:"#262626",
  muted:"#52525b",muted2:"#71717a",subtle:"#a1a1aa",white:"#ffffff",
  green:"#22c55e",amber:"#f59e0b",orange:"#f97316",purple:"#7c3aed",blue:"#3b82f6",
  display:"'Space Grotesk','Inter',sans-serif",body:"'Inter',system-ui,sans-serif",
};

const STOPS = [
  {name:"Churchgate",lat:18.9322,lng:72.8264},{name:"CST",lat:18.94,lng:72.8354},
  {name:"Mumbai Central",lat:18.9694,lng:72.8194},{name:"Dadar",lat:19.0178,lng:72.8478},
  {name:"Bandra",lat:19.0596,lng:72.8295},{name:"Andheri",lat:19.1136,lng:72.8697},
  {name:"Ghatkopar",lat:19.0863,lng:72.9082},{name:"Borivali",lat:19.2307,lng:72.8567},
  {name:"Thane",lat:19.1893,lng:72.9624},{name:"Kurla",lat:19.0726,lng:72.8795},
  {name:"Virar",lat:19.459,lng:72.8125},{name:"Panvel",lat:18.9894,lng:73.1175},
];

const ROUTE_TEMPLATES = [
  {mode:"train",line:"Western Railway Fast",emoji:"🚆",color:"#7c3aed",baseTime:28,baseFare:"₹25",platform:"Pf 3",crowd:"low"},
  {mode:"metro",line:"Metro Line 2A",emoji:"🚇",color:"#f97316",baseTime:34,baseFare:"₹40",platform:"Pf 1",crowd:"medium"},
  {mode:"bus",  line:"Route 11 (Limited)", emoji:"🚌",color:"#dc2626",baseTime:42,baseFare:"₹18",platform:"Bay 4",crowd:"high"},
  {mode:"train",line:"Central Railway Slow",emoji:"🚆",color:"#7c3aed",baseTime:38,baseFare:"₹25",platform:"Pf 1",crowd:"high"},
  {mode:"metro",line:"Metro Line 1",emoji:"🚇",color:"#f97316",baseTime:30,baseFare:"₹35",platform:"Pf 2",crowd:"low"},
];

const ALERT_POOL = [
  {id:1,type:"delay",sev:"high",icon:Clock,color:"#f59e0b",title:"Western Railway — Signal fault near Bandra",msg:"Trains running 7+ min late. Platform changes possible at Dadar."},
  {id:2,type:"platform_change",sev:"medium",icon:RefreshCw,color:"#3b82f6",title:"Metro Line 1 — Platform change at Andheri",msg:"Now departing from Platform 2. Follow concourse signage."},
  {id:3,type:"crowd",sev:"medium",icon:Users,color:"#f97316",title:"Churchgate → Andheri — High occupancy",msg:"Coaches 1–4 severely crowded. Board from coaches 6–9."},
  {id:4,type:"info",sev:"low",icon:Info,color:"#52525b",title:"Route 11 Bus — Normal operations",msg:"All stops on schedule. Bay 4 confirmed at Churchgate."},
  {id:5,type:"disruption",sev:"high",icon:AlertTriangle,color:"#ef4444",title:"Harbour Line — Track work between Kurla-CST",msg:"Services suspended until 11:00. Take bus replacement."},
  {id:6,type:"delay",sev:"medium",icon:Clock,color:"#f59e0b",title:"Metro Line 2A — 5-min delay at Ghatkopar",msg:"Increased dwell time due to crowding. Next service in 8 min."},
];

const CROWD_COLOR={low:"#22c55e",medium:"#f59e0b",high:"#ef4444"};
const CROWD_LABEL={low:"Light",medium:"Moderate",high:"Busy"};

function nowStr(){return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});}
function addMins(m){const d=new Date(Date.now()+m*60000);return d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});}

function genRoutes(origin,dest){
  return ROUTE_TEMPLATES.map((t,i)=>{
    const jitter=Math.floor(Math.random()*7)-2;
    const delay=i===2?Math.floor(Math.random()*8)+2:Math.random()>0.7?Math.floor(Math.random()*5):0;
    const total=t.baseTime+jitter+delay;
    const conf=delay>3?0.62+Math.random()*0.12:0.88+Math.random()*0.1;
    const walk=+(0.15+Math.random()*0.55).toFixed(2);
    return{id:`opt-${i}`,mode:t.mode,line:t.line,emoji:t.emoji,color:t.color,
      board:origin?.name||"Origin",alight:dest?.name||"Destination",
      platform:t.platform,fare:t.baseFare,walk,total_minutes:total,
      eta:addMins(total),delay,crowd:t.crowd,conf,disrupted:delay>5};
  }).sort((a,b)=>a.total_minutes-b.total_minutes);
}

function LiveDot({color=T.green,size=7}){
  return(
    <span style={{position:"relative",display:"inline-flex",width:size,height:size,flexShrink:0}}>
      <span style={{position:"absolute",inset:0,borderRadius:"50%",background:color,opacity:0.35,animation:"ping 1.8s ease-in-out infinite"}}/>
      <span style={{position:"relative",borderRadius:"50%",background:color,width:"100%",height:"100%"}}/>
    </span>
  );
}

function Badge({children,color}){
  return <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,fontWeight:600,background:`${color}15`,color,border:`1px solid ${color}28`,flexShrink:0}}>{children}</span>;
}

function StopSelect({label,value,onChange,icon:Icon}){
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[]);
  return(
    <div ref={ref} style={{position:"relative",flex:1}}>
      <div style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{label}</div>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:12,border:`1px solid ${open?"rgba(220,38,38,0.5)":T.border2}`,background:T.surface2,cursor:"pointer",textAlign:"left",boxShadow:open?`0 0 0 3px rgba(220,38,38,0.08)`:"none",transition:"all 0.15s"}}>
        <Icon size={14} color={value?T.red:T.muted} style={{flexShrink:0}}/>
        <span style={{flex:1,fontSize:13,color:value?T.white:T.muted}}>{value?.name||`Select ${label}`}</span>
        <ChevronDown size={12} color={T.muted} style={{flexShrink:0,transform:open?"rotate(180deg)":"none",transition:"transform 0.15s"}}/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:999,background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",overflow:"hidden",maxHeight:240,overflowY:"auto"}}>
          {STOPS.map(s=>(
            <button key={s.name} onClick={()=>{onChange(s);setOpen(false);}}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",borderBottom:`1px solid ${T.border}`}}
              onMouseEnter={e=>e.currentTarget.style.background=T.surface3}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <MapPin size={12} color={T.red} style={{flexShrink:0}}/>
              <span style={{fontSize:13,color:T.subtle}}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteCard({r,rank,isSelected,onSelect}){
  const [exp,setExp]=useState(false);
  const isBest=rank===0;
  return(
    <div onClick={()=>{setExp(e=>!e);onSelect(r);}}
      style={{borderRadius:14,border:`1px solid ${isSelected?`${r.color}55`:isBest?`${r.color}28`:T.border2}`,background:isSelected?`${r.color}08`:isBest?`${r.color}05`:T.surface2,cursor:"pointer",overflow:"hidden",transition:"all 0.2s",boxShadow:isSelected?`0 0 0 2px ${r.color}20`:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px"}}>
        <div style={{width:42,height:42,borderRadius:12,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:`${r.color}12`,border:`1px solid ${r.color}25`}}>
          {r.emoji}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:T.white}}>{r.line}</span>
            {isBest&&<Badge color={T.red}>Best</Badge>}
            {r.disrupted&&<Badge color="#ef4444">⚠ Delay</Badge>}
          </div>
          <div style={{fontSize:11,color:T.muted}}>{r.board} → {r.alight} · {r.platform}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:T.display,fontWeight:700,fontSize:22,color:T.white,lineHeight:1}}>
            {r.total_minutes}<span style={{fontSize:12,fontWeight:400,color:T.muted,marginLeft:2}}>min</span>
          </div>
          <div style={{fontSize:11,color:T.muted,marginTop:3}}>Arr {r.eta}</div>
        </div>
      </div>
      <div style={{display:"flex",borderTop:`1px solid ${T.border}`,padding:"9px 16px",gap:8}}>
        {[
          {label:"Fare",value:r.fare,color:T.subtle},
          {label:"Walk",value:`${Math.round(r.walk*1000)}m`,color:T.subtle},
          {label:"Crowd",value:CROWD_LABEL[r.crowd],color:CROWD_COLOR[r.crowd]},
          {label:"Delay",value:r.delay>0?`+${r.delay} min`:"On time",color:r.delay>0?"#ef4444":T.green},
        ].map(({label,value,color})=>(
          <div key={label} style={{flex:1}}>
            <div style={{fontSize:10,color:T.muted,marginBottom:2}}>{label}</div>
            <div style={{fontSize:11,fontWeight:600,color}}>{value}</div>
          </div>
        ))}
      </div>
      {exp&&(
        <div style={{borderTop:`1px solid ${T.border}`,padding:"12px 16px",background:T.surface,display:"flex",flexWrap:"wrap",gap:8}}>
          {[{k:"Confidence",v:`${Math.round(r.conf*100)}%`},{k:"Board at",v:r.platform},{k:"Fare",v:r.fare}].map(({k,v})=>(
            <div key={k} style={{flex:"1 1 100px",background:T.surface2,borderRadius:8,padding:"8px 10px",border:`1px solid ${T.border2}`}}>
              <div style={{fontSize:10,color:T.muted,marginBottom:3}}>{k}</div>
              <div style={{fontSize:12,fontWeight:600,color:T.white}}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertItem({a,fresh}){
  const Icon=a.icon;
  return(
    <div style={{padding:"11px 13px",borderRadius:12,marginBottom:8,background:`${a.color}08`,border:`1px solid ${a.color}22`,display:"flex",gap:10,alignItems:"flex-start",animation:fresh?"slide-in 0.3s ease both":undefined}}>
      <div style={{width:28,height:28,borderRadius:8,background:`${a.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
        <Icon size={13} color={a.color}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:600,color:T.white}}>{a.title}</span>
          <span style={{fontSize:9,padding:"1px 6px",borderRadius:99,background:`${a.color}15`,color:a.color,border:`1px solid ${a.color}28`,fontWeight:600,flexShrink:0,textTransform:"capitalize"}}>{a.type.replace("_"," ")}</span>
          <span style={{width:5,height:5,borderRadius:"50%",background:a.sev==="high"?"#ef4444":a.sev==="medium"?T.amber:T.green,flexShrink:0}}/>
        </div>
        <p style={{fontSize:11,color:T.muted2,lineHeight:1.5}}>{a.msg}</p>
      </div>
    </div>
  );
}

function NetworkStatus(){
  const lines=[
    {name:"Western Rail",color:T.purple,status:"delayed",delay:7},
    {name:"Central Rail",color:T.purple,status:"normal",delay:0},
    {name:"Harbour Rail",color:T.purple,status:"suspended",delay:null},
    {name:"Metro Line 1",color:T.orange,status:"normal",delay:0},
    {name:"Metro Line 2A",color:T.orange,status:"normal",delay:2},
    {name:"BEST Bus",color:T.red,status:"normal",delay:0},
  ];
  const STATUS={normal:[T.green,"Running"],delayed:[T.amber,"Delayed"],suspended:["#ef4444","Suspended"]};
  return(
    <div>
      {lines.map(l=>{
        const[sc,sl]=STATUS[l.status];
        return(
          <div key={l.name} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:3,height:22,borderRadius:99,background:l.color,flexShrink:0}}/>
            <span style={{flex:1,fontSize:12,color:T.subtle}}>{l.name}</span>
            <span style={{fontSize:11,fontWeight:600,color:sc}}>{sl}{l.delay>0?` +${l.delay}m`:""}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CommuterDashboard(){
  const [origin,setOrigin]=useState(null);
  const [dest,setDest]=useState(null);
  const [dateOpt,setDateOpt]=useState("today");
  const [a11y,setA11y]=useState(false);
  const [loading,setLoading]=useState(false);
  const [routes,setRoutes]=useState([]);
  const [selected,setSelected]=useState(null);
  const [alerts,setAlerts]=useState(ALERT_POOL.slice(0,3));
  const [freshId,setFreshId]=useState(null);
  const [toast,setToast]=useState(null);
  const [clock,setClock]=useState(nowStr());
  const [sideTab,setSideTab]=useState("alerts");
  const [modeFilter,setModeFilter]=useState("all");
  const [searched,setSearched]=useState(false);
  const [tick,setTick]=useState(0);

  useEffect(()=>{const id=setInterval(()=>setClock(nowStr()),15000);return()=>clearInterval(id);},[]);

  useEffect(()=>{
    if(!searched)return;
    const id=setInterval(()=>{setTick(t=>t+1);setRoutes(genRoutes(origin,dest));},30000);
    return()=>clearInterval(id);
  },[searched,origin,dest]);

  useEffect(()=>{
    const push=()=>{
      const a=ALERT_POOL[Math.floor(Math.random()*ALERT_POOL.length)];
      const fresh={...a,id:Date.now()};
      setAlerts(prev=>[fresh,...prev].slice(0,8));
      setFreshId(fresh.id);setToast(fresh);
      setTimeout(()=>setFreshId(null),800);
      setTimeout(()=>setToast(null),5000);
    };
    const id=setTimeout(push,20000+Math.random()*20000);
    return()=>clearTimeout(id);
  },[alerts]);

  const swap=()=>{setOrigin(dest);setDest(origin);setRoutes([]);setSearched(false);};

  const search=()=>{
    if(!origin||!dest)return;
    setLoading(true);setModeFilter("all");
    setTimeout(()=>{setRoutes(genRoutes(origin,dest));setSearched(true);setLoading(false);setTick(0);},1400);
  };

  const filtered=modeFilter==="all"?routes:routes.filter(r=>r.mode===modeFilter);
  const highCount=alerts.filter(a=>a.sev==="high").length;

  const DATE_OPTS=[
    {id:"today",label:"Today",sub:new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})},
    {id:"tomorrow",label:"Tomorrow",sub:new Date(Date.now()+86400000).toLocaleDateString("en-IN",{day:"numeric",month:"short"})},
    {id:"dayafter",label:"Day After",sub:new Date(Date.now()+172800000).toLocaleDateString("en-IN",{day:"numeric",month:"short"})},
  ];

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0a0a0a;}
    ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#262626;border-radius:99px;}
    @keyframes spin{to{transform:rotate(360deg);}}
    @keyframes ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.2);opacity:0}}
    @keyframes fade-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slide-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .spin{animation:spin .8s linear infinite;}
    .fade-up{animation:fade-up .3s ease both;}
    .slide-in{animation:slide-in .3s ease both;}
  `;

  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.body,display:"flex",flexDirection:"column"}}>
      <style>{css}</style>

      {/* TOPBAR */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",background:T.surface,borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:50,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:T.red,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 16px ${T.redGlow}`}}>
            <Train size={14} color="#fff"/>
          </div>
          <span style={{fontFamily:T.display,fontWeight:700,fontSize:17,color:T.white,letterSpacing:"-0.02em"}}>SAFAR</span>
          <span style={{fontSize:11,color:T.muted,paddingLeft:8,borderLeft:`1px solid ${T.border2}`,marginLeft:4}}>Commuter</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <LiveDot/><span style={{fontSize:12,color:T.muted}}>{clock}</span>
          </div>
          {highCount>0&&(
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:8,background:"rgba(220,38,38,0.09)",border:"1px solid rgba(220,38,38,0.25)"}}>
              <Bell size={11} color={T.red}/><span style={{fontSize:11,fontWeight:600,color:T.red}}>{highCount} active</span>
            </div>
          )}
        </div>
      </header>

      {/* Toast */}
      {toast&&(
        <div className="slide-in" style={{position:"fixed",top:62,right:16,zIndex:999,display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,background:T.surface3,border:"1px solid rgba(220,38,38,0.3)",boxShadow:"0 8px 30px rgba(0,0,0,0.5)",maxWidth:300}}>
          <Bell size={12} color={T.red} style={{flexShrink:0}}/>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:T.red,textTransform:"uppercase",letterSpacing:"0.08em"}}>New alert</div>
            <div style={{fontSize:11,color:T.subtle,marginTop:2}}>{toast.title}</div>
          </div>
        </div>
      )}

      {/* BODY */}
      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* MAIN */}
        <main style={{flex:1,overflowY:"auto",padding:"22px 20px"}}>
          <div style={{maxWidth:660}}>

            {/* Heading */}
            <div style={{marginBottom:20}}>
              <h1 style={{fontFamily:T.display,fontWeight:700,fontSize:24,color:T.white,letterSpacing:"-0.02em",marginBottom:4}}>Plan your journey</h1>
              <p style={{fontSize:12,color:T.muted}}>Bus · Metro · Local — unified in real time across Mumbai</p>
            </div>

            {/* SEARCH CARD */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:"20px",marginBottom:18}}>

              {/* Date chips */}
              <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
                {DATE_OPTS.map(d=>(
                  <button key={d.id} onClick={()=>setDateOpt(d.id)}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 12px",borderRadius:10,border:`1px solid ${dateOpt===d.id?`${T.red}55`:T.border2}`,background:dateOpt===d.id?T.redDim:T.surface2,cursor:"pointer",transition:"all 0.15s"}}>
                    <span style={{fontSize:11,fontWeight:600,color:dateOpt===d.id?T.red:T.muted}}>{d.label}</span>
                    <span style={{fontSize:10,color:dateOpt===d.id?`${T.red}aa`:T.muted,marginTop:1}}>{d.sub}</span>
                  </button>
                ))}
                <div style={{flex:1}}/>
                <button onClick={()=>setA11y(v=>!v)}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"6px 11px",borderRadius:10,border:`1px solid ${a11y?`${T.blue}55`:T.border2}`,background:a11y?"rgba(59,130,246,0.08)":T.surface2,cursor:"pointer"}}>
                  <Accessibility size={12} color={a11y?T.blue:T.muted}/>
                  <span style={{fontSize:11,fontWeight:600,color:a11y?T.blue:T.muted}}>Accessible</span>
                </button>
              </div>

              {/* From / Swap / To */}
              <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
                <StopSelect label="From" value={origin} onChange={v=>{setOrigin(v);setSearched(false);}} icon={MapPin}/>
                <button onClick={swap}
                  style={{width:34,height:34,borderRadius:9,border:`1px solid ${T.border2}`,background:T.surface2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=`${T.red}55`}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=T.border2}>
                  <ArrowUpDown size={12} color={T.muted}/>
                </button>
                <StopSelect label="To" value={dest} onChange={v=>{setDest(v);setSearched(false);}} icon={Navigation}/>
              </div>

              {/* Search btn */}
              <button onClick={search} disabled={!origin||!dest||loading}
                style={{width:"100%",marginTop:14,padding:"13px",borderRadius:12,border:"none",background:T.red,color:T.white,fontSize:14,fontWeight:600,fontFamily:T.display,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:(!origin||!dest||loading)?"not-allowed":"pointer",opacity:(!origin||!dest||loading)?0.35:1,boxShadow:(!origin||!dest||loading)?"none":`0 0 28px ${T.redGlow}`,transition:"all 0.2s"}}>
                {loading?<><Loader size={14} className="spin"/> Finding fastest routes…</>:<><Zap size={14}/> Find routes</>}
              </button>
            </div>

            {/* RESULTS */}
            {searched&&!loading&&(
              <div className="fade-up">
                {/* Header */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                      <span style={{fontFamily:T.display,fontWeight:700,fontSize:15,color:T.white}}>{origin?.name}</span>
                      <ArrowRight size={13} color={T.red}/>
                      <span style={{fontFamily:T.display,fontWeight:700,fontSize:15,color:T.white}}>{dest?.name}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:T.muted}}>
                      <LiveDot size={6}/><span>Live · {filtered.length} options</span>
                      {tick>0&&<span style={{color:T.green}}>· Refreshed {tick}×</span>}
                      {routes.some(r=>r.delay>0)&&<span style={{color:T.amber}}>· ⚠ Delays active</span>}
                    </div>
                  </div>
                  {/* Mode filter */}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[{id:"all",label:"All",c:T.muted},{id:"train",label:"🚆 Train",c:T.purple},{id:"metro",label:"🚇 Metro",c:T.orange},{id:"bus",label:"🚌 Bus",c:T.red}].map(m=>(
                      <button key={m.id} onClick={()=>setModeFilter(m.id)}
                        style={{padding:"4px 10px",borderRadius:7,fontSize:11,fontWeight:600,border:`1px solid ${modeFilter===m.id?`${m.c}55`:T.border2}`,background:modeFilter===m.id?`${m.c}10`:T.surface2,color:modeFilter===m.id?m.c:T.muted,cursor:"pointer",transition:"all 0.15s"}}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cards */}
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {filtered.length===0?(
                    <div style={{textAlign:"center",padding:"36px 0",color:T.muted}}>
                      <Bus size={28} style={{opacity:0.3,marginBottom:10}}/>
                      <div style={{fontSize:13}}>No {modeFilter} routes found.</div>
                    </div>
                  ):filtered.map((r,i)=>(
                    <RouteCard key={r.id} r={r} rank={i} isSelected={selected?.id===r.id} onSelect={setSelected}/>
                  ))}
                </div>

                {filtered.length>0&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                    <CheckCircle size={10} color={T.green}/>
                    <span style={{fontSize:11,color:T.muted}}>ML-powered ETAs · Crowd predictions · Auto-refreshes every 30s</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* SIDEBAR */}
        <aside style={{width:270,borderLeft:`1px solid ${T.border}`,background:T.surface,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
          {/* Tabs */}
          <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
            {[{id:"alerts",label:"Alerts",badge:highCount>0?highCount:null},{id:"network",label:"Network",badge:null}].map(tab=>{
              const active=sideTab===tab.id;
              return(
                <button key={tab.id} onClick={()=>setSideTab(tab.id)}
                  style={{flex:1,padding:"11px 6px",border:"none",background:"transparent",borderBottom:`2px solid ${active?T.red:"transparent"}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"all 0.15s"}}>
                  <span style={{fontSize:10,fontWeight:600,color:active?T.red:T.muted,textTransform:"uppercase",letterSpacing:"0.05em"}}>{tab.label}</span>
                  {tab.badge&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:99,background:`${T.red}20`,color:T.red,border:`1px solid ${T.red}30`,fontWeight:700}}>{tab.badge}</span>}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{flex:1,overflowY:"auto",padding:14}}>
            {sideTab==="alerts"&&(
              <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <Bell size={12} color={T.red}/>
                    <span style={{fontSize:12,fontWeight:600,color:T.white}}>Live alerts</span>
                    {highCount>0&&<Badge color={T.red}>{highCount} high</Badge>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <LiveDot size={6}/><span style={{fontSize:10,color:T.muted}}>Live</span>
                  </div>
                </div>
                {alerts.map(a=><AlertItem key={a.id} a={a} fresh={a.id===freshId}/>)}
              </>
            )}
            {sideTab==="network"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}>
                  <Radio size={12} color={T.green}/>
                  <span style={{fontSize:12,fontWeight:600,color:T.white}}>Network status</span>
                </div>
                <NetworkStatus/>
              </>
            )}
          </div>

          <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 14px",flexShrink:0}}>
            <div style={{fontSize:10,color:T.muted,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <LiveDot size={5} color={T.green}/> Real-time data · Updates every 30s
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
