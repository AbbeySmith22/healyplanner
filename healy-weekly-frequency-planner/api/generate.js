const programs = require('../data/healy-programs.json');
const BASE=['Gold Cycle','Bioenergetic Support'];
const HOL=['Bioenergetic Harmony 1','Bioenergetic Harmony 2','Mental Balance','Meridians 1','Meridians 2'];
const RES=['Chakras','Fitness','Local Stimulation','Sleep','The Power Of Three'];
const PLUS=['Deep Cycle H','Learning','Skin'];
const PRO=['Bioenergetic Defence','Job','Beauty'];
const OBS=['Soul Cycle','Wellbeing'];
const TIERS={Gold:BASE,Holistic:[...BASE,...HOL],Resonance:[...BASE,...HOL,...RES],'Resonance Plus':[...BASE,...HOL,...RES,...PLUS],Professional:[...BASE,...HOL,...RES,...PLUS,...PRO],Discover:[...BASE,...HOL],Evolve:[...BASE,...HOL,...RES.filter(g=>g!=='Fitness'),...PLUS],Pro:[...BASE,...HOL,...RES.filter(g=>g!=='Fitness'),...PLUS,...PRO],Obsidian:[...BASE,...HOL,...RES.filter(g=>g!=='Fitness'),...PLUS,...PRO,...OBS]};
const clean = v=>String(v||'').slice(0,1500);
const norm = s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
module.exports=async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS')return res.status(200).end();
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 try{
  const b=req.body||{};if(!clean(b.goal).trim())return res.status(400).json({error:'Please tell us what you want to focus on.'});
  const edition=clean(b.edition);const defaultGroups=TIERS[edition]||[];
  const confirmedGroups=Array.isArray(b.groups)?b.groups.filter(g=>typeof g==='string').slice(0,45):[];
  // Never infer a user's actual entitlements from edition alone: explicit group confirmations only.
  const allowedGroups=new Set(confirmedGroups.filter(g=>defaultGroups.includes(g)||b.upgrades===true));
  const devices=Array.isArray(b.devices)?b.devices:[];
  const eligible=programs.filter(p=>(p.device==='Healy'&&devices.includes('Healy')&&allowedGroups.has(p.group))||(p.device==='MagHealy'&&devices.includes('MagHealy')&&b.magGroups?.includes(p.group)));
  const goal=clean(b.goal), context=clean(b.context), fav=clean(b.favourites);
  const terms=(goal+' '+context+' '+fav).toLowerCase().split(/\W+/).filter(x=>x.length>3);
  const ranked=eligible.map(p=>({p,score:terms.reduce((s,t)=>s+(p.name.toLowerCase().includes(t)?4:0)+((p.keywords||[]).some(k=>k.toLowerCase().includes(t))?2:0),0)})).sort((a,b)=>b.score-a.score).slice(0,50).map(x=>x.p);
  const catalogue=(ranked.length?ranked:eligible.slice(0,50)).map(p=>({group:p.group,name:p.name,description:p.description.slice(0,360)}));
  const modules=Array.isArray(b.modules)?b.modules.filter(x=>['Resonance Analysis','Aura Analysis','Success Coach'].includes(x)):[];
  const scanDb=Array.isArray(b.databases)?b.databases.filter(x=>['Bach Flowers','Australian Bush Flowers','Alaskan Gems','Creative Homeopathy','Schüssler Salts','I Ching','Healy Programs'].includes(x)):[];
  const payload={goal,context,edition,devices,minutesPerDay:Number(b.minutes)||15,daysPerWeek:Number(b.days)||4,experience:clean(b.experience),favourites:fav,modules,scanDatabases:modules.includes('Resonance Analysis')?scanDb:[],allowedPrograms:catalogue};
  if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({error:'Add ANTHROPIC_API_KEY in Vercel Environment Variables.'});
  const system=`You create realistic seven-day optional Healy wellness routines. Return ONLY valid JSON with shape {"intro":"...","days":[{"day":"Monday","type":"Pink Program|Resonance Scan|Aura Scan|Coaching Scan|Rest / Flex|Reflection","title":"...","group":"...","minutes":"...","why":"...","steps":["..."],"optional":false}],"busyDay":"...","note":"..."}. Exactly Monday-Sunday, 7 entries. Schedule at most daysPerWeek active days; other days rest/reflection. Only use program name+group EXACTLY present in allowedPrograms. If none available, make reflection-only plan, say confirm access. Only suggest scan types explicitly present in modules. Resonance scans only suggest databases explicitly listed in scanDatabases; never invent scan outcomes, scan focus editing, or frequency duration. Resonance focus is held mentally, not edited. Aura/Success Coach focus can be edited. Never invent program durations; use 'Check app duration' for Pink Programs; minutesPerDay is a time budget not an asserted program duration. Keep schedule feasible and flexible. Do not claim Healy scans diagnose, objectively measure, treat, cure or prevent conditions. Program descriptions are unverified thematic references, not proof of effects. Do not promise outcomes. Friendly, grounded, occasionally playful but professional. No markdown fences.`;
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-6',max_tokens:5000,temperature:0.4,system,messages:[{role:'user',content:JSON.stringify(payload)}]})});
  const data=await r.json();if(!r.ok)throw Error(data.error?.message||'AI service unavailable');
  const txt=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');let out=JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g,''));
  const valid=new Set(catalogue.map(p=>norm(p.group)+'|'+norm(p.name)));
  out.days=(out.days||[]).slice(0,7).map(d=>{const copy={...d};if(d.type==='Pink Program'&&!valid.has(norm(d.group)+'|'+norm(d.title)))return {day:d.day,type:'Rest / Flex',title:'Choose an available program',group:'',minutes:'Optional',why:'A recommended program could not be verified against your selected access.',steps:['Check your available programs and try again.'],optional:true};if(d.type==='Resonance Scan'&&!modules.includes('Resonance Analysis'))return {day:d.day,type:'Rest / Flex',title:'Reflection day',minutes:'Optional',why:'Resonance access not confirmed.',steps:[],optional:true};if(d.type==='Aura Scan'&&!modules.includes('Aura Analysis')||d.type==='Coaching Scan'&&!modules.includes('Success Coach'))return {day:d.day,type:'Rest / Flex',title:'Reflection day',minutes:'Optional',why:'Scan access not confirmed.',steps:[],optional:true};return copy;});
  return res.status(200).json(out);
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to generate your plan. Please try again.'});}
};
