(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const fmtDay=s=>parse(s).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
const fmtShort=s=>parse(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const weekStart=s=>{const d=parse(s);const k=(d.getDay()+6)%7;d.setDate(d.getDate()-k);return iso(d)};
const uid=()=>Math.random().toString(36).slice(2,10);
const r1=n=>Math.round(n*10)/10;

const S={days:{},weighins:{},settings:{plan:[]},day:iso(new Date()),tab:'today',draftType:null,draftEx:null,draftDay:null,planDraft:null};

// ---------- persistence (Supabase) ----------
const sb=window.supabase.createClient(window.FIL_CONFIG.SUPABASE_URL,window.FIL_CONFIG.SUPABASE_ANON_KEY);
let user=null;
const queues={};
async function writeNow(path,data){
  const[kind,key]=path.split('/');
  if(kind==='days') return sb.from('days').upsert({user_id:user.id,date:key,meals:data.meals||[],workout:data.workout||{type:'rest'}},{onConflict:'user_id,date'});
  if(kind==='weighins') return sb.from('weighins').upsert({user_id:user.id,date:key,kg:data.kg},{onConflict:'user_id,date'});
  if(kind==='settings') return sb.from('settings').upsert({user_id:user.id,kcal_target:data.kcalTarget===''?null:data.kcalTarget??null,protein_target:data.proteinTarget===''?null:data.proteinTarget??null,goal_weight:data.goalWeight===''?null:data.goalWeight??null,plan:data.plan||[]},{onConflict:'user_id'});
}
function write(path,data){
  if(!user) return Promise.resolve();
  const q=(queues[path]||Promise.resolve()).then(async()=>{
    setSave('Saving…');
    let {error}=await writeNow(path,data);
    if(error){await new Promise(r=>setTimeout(r,500+Math.random()*700));({error}=await writeNow(path,data))}
    setSave(error?'Couldn\'t save. Check your connection and try again.':'Saved');
  });
  queues[path]=q;return q;
}
async function remove(path){
  if(!user) return;const[kind,key]=path.split('/');
  const {error}=await sb.from(kind).delete().eq('user_id',user.id).eq('date',key);
  if(error)setSave('Couldn\'t delete. Try again.');
}
let saveT;function setSave(t){const el=$('#saveState');el.textContent=t;clearTimeout(saveT);if(t==='Saved')saveT=setTimeout(()=>el.textContent='',1800)}

function dayDoc(d){return S.days[d]||{date:d,meals:[],workout:{type:'rest'}}}
function saveDay(d,doc){S.days[d]=doc;render();write('days/'+d,doc)}

// ---------- tabs ----------
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{S.tab=b.dataset.tab;try{localStorage.setItem('fil-tab',S.tab)}catch(e){}renderTabs();render()}));
function renderTabs(){document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===S.tab));['today','plan','progress','targets'].forEach(t=>$('#view-'+t).hidden=t!==S.tab)}

// ---------- plates ----------
function sortedWeights(){return Object.values(S.weighins).filter(w=>w&&w.kg).sort((a,b)=>a.date<b.date?-1:1)}
function weekStats(ws){
  let k=0,p=0,n=0,gym=0,street=0;
  for(let i=0;i<7;i++){const d=addDays(ws,i);const doc=S.days[d];if(!doc)continue;
    if(doc.meals&&doc.meals.length){n++;doc.meals.forEach(m=>{k+=+m.kcal||0;p+=+m.protein||0})}
    const t=doc.workout&&doc.workout.type;if(t==='gym')gym++;if(t==='street')street++;}
  return {k:n?k/n:null,p:n?p/n:null,n,gym,street};
}
function renderPlates(){
  const ws=sortedWeights();const last=ws[ws.length-1],first=ws[0];
  const st=weekStats(weekStart(iso(new Date())));
  const goal=+S.settings.goalWeight||null;
  let diff=last&&first?r1(last.kg-first.kg):null;
  const tiles=[
    ['Weight',last?`${r1(last.kg)}<small>kg</small>`:'–',last?`on ${fmtShort(last.date)}`:'Add a weigh-in'],
    ['Since start',diff!==null&&ws.length>1?`<span class="${diff<=0?'down':'up'}">${diff>0?'+':''}${diff}</span><small>kg</small>`:'–',goal&&last?`${r1(last.kg-goal)} kg to goal`:(first?`started ${fmtShort(first.date)}`:'')],
    ['This week',st.k!==null?`${Math.round(st.k)}<small>kcal/day</small>`:'–',st.p!==null?`${Math.round(st.p)} g protein/day`:'No meals logged yet'],
    ['Sessions',`${st.gym}<small>gym</small> ${st.street}<small>street</small>`,'Aim: 3 gym + 1 street'],
  ];
  $('#plates').innerHTML=tiles.map(t=>`<div class="plate"><span class="lbl">${t[0]}</span><span class="val num">${t[1]}</span><span class="note">${t[2]}</span></div>`).join('');
}

// ---------- today ----------
function foodHistory(){const m={};Object.values(S.days).forEach(d=>(d.meals||[]).forEach(x=>{m[x.name.trim().toLowerCase()]={name:x.name,kcal:x.kcal,protein:x.protein}}));return m}
function renderToday(){
  const d=S.day,doc=dayDoc(d);
  $('#dayLabel').textContent=(d===iso(new Date())?'Today · ':'')+fmtDay(d);
  // food
  const meals=doc.meals||[];const order={Breakfast:0,Lunch:1,Dinner:2,Snack:3};
  const sorted=[...meals].sort((a,b)=>(order[a.meal]??4)-(order[b.meal]??4));
  $('#mealRows').innerHTML=sorted.length?sorted.map(m=>`<tr><td><span class="chip">${esc(m.meal)}</span></td><td>${esc(m.name)}</td><td class="r num">${Math.round(m.kcal)}</td><td class="r num">${r1(m.protein)}</td><td class="r"><button class="x" data-del="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">×</button></td></tr>`).join(''):`<tr><td colspan="5" class="empty">Nothing logged for this day yet. Add your first meal below.</td></tr>`;
  const k=meals.reduce((s,m)=>s+(+m.kcal||0),0),p=meals.reduce((s,m)=>s+(+m.protein||0),0);
  const tk=+S.settings.kcalTarget||0,tp=+S.settings.proteinTarget||0;
  $('#kcalTxt').textContent=tk?`${Math.round(k)} / ${tk} kcal · ${tk-Math.round(k)>=0?(tk-Math.round(k))+' left':Math.round(k)-tk+' over'}`:`${Math.round(k)} kcal · set a target`;
  $('#protTxt').textContent=tp?`${r1(p)} / ${tp} g · ${tp-p>0?r1(tp-p)+' g to go':'target hit'}`:`${r1(p)} g · set a target`;
  $('#kcalFill').style.width=(tk?Math.min(100,k/tk*100):0)+'%';
  $('#protFill').style.width=(tp?Math.min(100,p/tp*100):0)+'%';
  $('#foodTotals').textContent=meals.length?`${meals.length} item${meals.length>1?'s':''}`:'';
  const hist=foodHistory();$('#foodHistory').innerHTML=Object.values(hist).map(h=>`<option value="${esc(h.name)}">`).join('');
  // training draft
  if(S.draftDay!==d){S.draftDay=d;S.trainDirty=false;const w=doc.workout||{type:'rest'};S.draftType=w.type||'rest';S.draftEx=(w.exercises||[]).map(e=>({...e}));$('#sAct').value=w.activity||'';$('#sMin').value=w.minutes||'';$('#sNotes').value=w.notes||'';$('#trainNote').textContent=w.type&&w.type!=='rest'?'Saved for this day.':''}
  document.querySelectorAll('#typeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.type===S.draftType));
  $('#gymBox').hidden=S.draftType!=='gym';$('#streetBox').hidden=S.draftType!=='street';
  const plan=S.settings.plan||[];
  const cur=$('#planPick').value;
  $('#planPick').innerHTML=plan.length?plan.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''):'<option value="">No sessions in your plan yet</option>';
  if(cur&&plan.some(s=>s.id===cur))$('#planPick').value=cur;
  renderExRows();
  // weigh-in
  const w=S.weighins[d];
  if(document.activeElement!==$('#wKg'))$('#wKg').value=w?w.kg:'';
  $('#delW').hidden=!w;$('#wNote').textContent=w?'Saved for this day.':'';
}
function dirty(){S.trainDirty=true;$('#trainNote').textContent='Unsaved changes'}
function renderExRows(){
  const ex=S.draftEx||[];
  $('#exRows').innerHTML=(ex.length?`<div class="exrow exhead"><span>Exercise</span><span>Sets</span><span>Reps</span><span>kg</span><span></span></div>`:'<div class="empty">Load a session from your plan, or add exercises one by one.</div>')+
  ex.map((e,i)=>`<div class="exrow" data-i="${i}"><input aria-label="Exercise" data-f="name" value="${esc(e.name)}" placeholder="Exercise"><input aria-label="Sets" data-f="sets" placeholder="Sets" type="number" min="0" inputmode="numeric" value="${esc(e.sets)}"><input aria-label="Reps" data-f="reps" value="${esc(e.reps)}" placeholder="Reps"><input aria-label="Weight kg" data-f="weight" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(e.weight)}" placeholder="kg"><button class="x" data-rm="${i}" aria-label="Remove exercise">×</button></div>`).join('');
}
$('#exRows').addEventListener('input',e=>{const row=e.target.closest('.exrow');if(!row)return;S.draftEx[+row.dataset.i][e.target.dataset.f]=e.target.value;dirty()});
$('#exRows').addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(!b)return;S.draftEx.splice(+b.dataset.rm,1);renderExRows();dirty()});
$('#addEx').addEventListener('click',()=>{S.draftEx.push({name:'',sets:'',reps:'',weight:''});renderExRows();const ins=$('#exRows').querySelectorAll('input[data-f="name"]');ins[ins.length-1].focus()});
$('#typeSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.draftType=b.dataset.type;renderToday();dirty()});
$('#loadPlan').addEventListener('click',()=>{const s=(S.settings.plan||[]).find(x=>x.id===$('#planPick').value);if(!s)return;S.draftEx=s.exercises.map(e=>({...e}));S.draftPlanName=s.name;renderExRows();$('#trainNote').textContent=`Loaded ${s.name}. Adjust the weights you actually lifted, then save.`});
$('#saveTrain').addEventListener('click',()=>{
  const d=S.day,doc={...dayDoc(d)};
  let w={type:S.draftType};
  if(S.draftType==='gym'){w.exercises=(S.draftEx||[]).filter(e=>String(e.name).trim()).map(e=>({name:String(e.name).trim(),sets:e.sets===''?'':+e.sets,reps:String(e.reps??''),weight:e.weight===''?'':+e.weight}));const pn=S.draftPlanName||(doc.workout&&doc.workout.planName);if(pn)w.planName=pn}
  if(S.draftType==='street'){w.activity=$('#sAct').value.trim();w.minutes=$('#sMin').value?+$('#sMin').value:'';w.notes=$('#sNotes').value.trim()}
  doc.workout=w;S.draftDay=null;saveDay(d,doc);$('#trainNote').textContent='Saved for this day.';
});
$('#fName').addEventListener('change',()=>{const h=foodHistory()[$('#fName').value.trim().toLowerCase()];if(h){$('#fKcal').value=h.kcal;$('#fProt').value=h.protein}});
$('#foodForm').addEventListener('submit',e=>{e.preventDefault();
  const name=$('#fName').value.trim();if(!name)return;
  const doc={...dayDoc(S.day)};doc.meals=[...(doc.meals||[]),{id:uid(),name,kcal:+$('#fKcal').value||0,protein:+$('#fProt').value||0,meal:$('#fMeal').value}];
  saveDay(S.day,doc);$('#fName').value='';$('#fKcal').value='';$('#fProt').value='';$('#fName').focus();
});
$('#mealRows').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;const doc={...dayDoc(S.day)};doc.meals=(doc.meals||[]).filter(m=>m.id!==b.dataset.del);saveDay(S.day,doc)});
$('#prevDay').addEventListener('click',()=>{S.day=addDays(S.day,-1);render()});
$('#nextDay').addEventListener('click',()=>{S.day=addDays(S.day,1);render()});
$('#goToday').addEventListener('click',()=>{S.day=iso(new Date());render()});
$('#saveW').addEventListener('click',()=>{const kg=parseFloat($('#wKg').value);if(!(kg>0)){$('#wNote').textContent='Enter your weight in kg.';return}const w={date:S.day,kg:r1(kg)};S.weighins[S.day]=w;render();write('weighins/'+S.day,w)});
$('#delW').addEventListener('click',()=>{delete S.weighins[S.day];render();remove('weighins/'+S.day)});
// meal default by time
(()=>{const h=new Date().getHours();$('#fMeal').value=h<11?'Breakfast':h<16?'Lunch':h<21?'Dinner':'Snack'})();

// ---------- plan ----------
function planDraft(){if(!S.planDraft)S.planDraft=JSON.parse(JSON.stringify(S.settings.plan||[]));return S.planDraft}
function renderPlan(){
  const plan=planDraft();
  $('#planList').innerHTML=plan.length?plan.map((s,si)=>`<div class="card" data-si="${si}">
    <div class="planhead"><input aria-label="Session name" data-sf="name" value="${esc(s.name)}"><button class="btn ghost sm" data-rmsession="${si}">Remove session</button></div>
    <div class="exgrid">${s.exercises.length?`<div class="exrow exhead"><span>Exercise</span><span>Sets</span><span>Reps</span><span>kg</span><span></span></div>`:''}
    ${s.exercises.map((e,ei)=>`<div class="exrow" data-ei="${ei}"><input aria-label="Exercise" data-f="name" value="${esc(e.name)}" placeholder="Exercise"><input aria-label="Sets" data-f="sets" placeholder="Sets" type="number" min="0" inputmode="numeric" value="${esc(e.sets)}"><input aria-label="Reps" data-f="reps" value="${esc(e.reps)}" placeholder="Reps"><input aria-label="Weight kg" data-f="weight" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(e.weight)}" placeholder="kg"><button class="x" data-rmex="${ei}" aria-label="Remove exercise">×</button></div>`).join('')}</div>
    <div class="row"><button class="btn sm" data-addex="${si}">+ Exercise</button></div></div>`).join(''):'<div class="card empty">No sessions yet. Add one for each gym day.</div>';
}
$('#planList').addEventListener('input',e=>{const c=e.target.closest('[data-si]');if(!c)return;const s=planDraft()[+c.dataset.si];
  if(e.target.dataset.sf)s.name=e.target.value;else{const r=e.target.closest('[data-ei]');s.exercises[+r.dataset.ei][e.target.dataset.f]=e.target.value}
  $('#savePlan').textContent='Save plan •'});
$('#planList').addEventListener('click',e=>{const c=e.target.closest('[data-si]');if(!c)return;const p=planDraft(),s=p[+c.dataset.si];let t;
  if((t=e.target.closest('[data-rmsession]')))p.splice(+t.dataset.rmsession,1);
  else if((t=e.target.closest('[data-rmex]')))s.exercises.splice(+t.dataset.rmex,1);
  else if(e.target.closest('[data-addex]'))s.exercises.push({name:'',sets:3,reps:'10',weight:''});
  else return;$('#savePlan').textContent='Save plan •';renderPlan()});
$('#addSession').addEventListener('click',()=>{const p=planDraft();p.push({id:uid(),name:'Gym '+(p.length+1),exercises:[{name:'',sets:3,reps:'10',weight:''}]});$('#savePlan').textContent='Save plan •';renderPlan()});
$('#savePlan').addEventListener('click',()=>{const plan=planDraft().map(s=>({id:s.id||uid(),name:String(s.name).trim()||'Session',exercises:s.exercises.filter(e=>String(e.name).trim()).map(e=>({name:String(e.name).trim(),sets:e.sets===''?'':+e.sets,reps:String(e.reps??''),weight:e.weight===''?'':+e.weight}))}));
  S.settings={...S.settings,plan};S.planDraft=null;$('#savePlan').textContent='Save plan';write('settings/main',S.settings);render()});

// ---------- targets ----------
function renderTargets(){['tKcal:kcalTarget','tProt:proteinTarget','tGoal:goalWeight'].forEach(x=>{const[id,k]=x.split(':');if(document.activeElement!==$('#'+id))$('#'+id).value=S.settings[k]??''})}
$('#saveTargets').addEventListener('click',()=>{const v=id=>$('#'+id).value===''?'':+$('#'+id).value;S.settings={...S.settings,kcalTarget:v('tKcal'),proteinTarget:v('tProt'),goalWeight:v('tGoal')};write('settings/main',S.settings);$('#tNote').textContent='Saved.';render()});

// ---------- charts ----------
function lineChart(series,{h=220,yFmt=v=>v,labels}={}){
  const W=640,P={l:56,r:18,t:22,b:34};
  const all=series.flatMap(s=>s.pts.map(p=>p.y));if(!all.length)return'';
  let lo=Math.min(...all),hi=Math.max(...all);if(series.some(s=>s.goal!=null)){series.forEach(s=>{if(s.goal!=null){lo=Math.min(lo,s.goal);hi=Math.max(hi,s.goal)}})}
  if(hi-lo<2){hi+=1;lo-=1}const padv=(hi-lo)*.12;lo-=padv;hi+=padv;
  const n=labels.length;const x=i=>P.l+(n<=1?(W-P.l-P.r)/2:i*(W-P.l-P.r)/(n-1));const y=v=>P.t+(hi-v)/(hi-lo)*(h-P.t-P.b);
  const ticks=4;let g='';for(let i=0;i<=ticks;i++){const v=lo+(hi-lo)*i/ticks;g+=`<line class="grid" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${P.l-6}" y="${y(v)+4}" text-anchor="end">${yFmt(v)}</text>`}
  const step=Math.max(1,Math.ceil(n/5));let xl='';labels.forEach((l,i)=>{if(i%step===0||i===n-1)xl+=`<text class="axis" x="${x(i)}" y="${h-10}" text-anchor="middle">${esc(l)}</text>`});
  let body='';series.forEach(s=>{const pts=s.pts.map(p=>[x(p.i),y(p.y)]);if(!pts.length)return;
    if(s.goal!=null)body+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(s.goal)}" y2="${y(s.goal)}" stroke="${s.color}" stroke-dasharray="4 4" stroke-width="1.5"/><text class="axis" x="${W-P.r}" y="${y(s.goal)-5}" text-anchor="end">goal ${s.goal}</text>`;
    if(s.area&&pts.length>1)body+=`<path class="area" fill="${s.color}" d="M${pts[0][0]},${h-P.b} ${pts.map(p=>'L'+p[0]+','+p[1]).join(' ')} L${pts[pts.length-1][0]},${h-P.b}Z"/>`;
    body+=`<path class="ln" stroke="${s.color}" d="${pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ')}"/>`;
    const e=pts[pts.length-1];body+=pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${i===pts.length-1?5:3}" fill="${s.color}"/>`).join('');
    body+=`<text class="axis" x="${Math.min(e[0],W-P.r-30)}" y="${e[1]-10}" text-anchor="middle" style="fill:var(--fg);font-weight:600">${yFmt(s.pts[s.pts.length-1].y)}</text>`});
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${g}${xl}${body}</svg>`;
}
function barChart(weeks){
  const W=640,h=240,P={l:56,r:52,t:16,b:34};if(!weeks.length)return'';
  const kMax=Math.max(...weeks.map(w=>w.k||0),+S.settings.kcalTarget||0)*1.15||1,pMax=Math.max(...weeks.map(w=>w.p||0),+S.settings.proteinTarget||0)*1.15||1;
  const n=weeks.length,bw=Math.min((W-P.l-P.r)/n,110),x0s=P.l+((W-P.l-P.r)-bw*n)/2,yk=v=>P.t+(1-v/kMax)*(h-P.t-P.b),yp=v=>P.t+(1-v/pMax)*(h-P.t-P.b);
  let g='';for(let i=0;i<=4;i++){const f=i/4,yy=P.t+f*(h-P.t-P.b);g+=`<line class="grid" x1="${P.l}" x2="${W-P.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="${P.l-6}" y="${yy+4}" text-anchor="end">${Math.round(kMax*(1-f))}</text><text class="axis" x="${W-P.r+6}" y="${yy+4}">${Math.round(pMax*(1-f))}</text>`}
  let b='';weeks.forEach((w,i)=>{const x0=x0s+i*bw+bw*.18,ww=bw*.3;
    if(w.k!=null)b+=`<rect x="${x0}" y="${yk(w.k)}" width="${ww}" height="${h-P.b-yk(w.k)}" rx="2" fill="var(--kcal)"><title>${Math.round(w.k)} kcal/day</title></rect>`;
    if(w.p!=null)b+=`<rect x="${x0+ww+2}" y="${yp(w.p)}" width="${ww}" height="${h-P.b-yp(w.p)}" rx="2" fill="var(--protein)"><title>${Math.round(w.p)} g/day</title></rect>`;
    b+=`<text class="axis" x="${x0s+i*bw+bw/2}" y="${h-10}" text-anchor="middle">${esc(fmtShort(w.ws))}</text>`});
  const tk=+S.settings.kcalTarget,tp=+S.settings.proteinTarget;
  if(tk)b+=`<line x1="${P.l}" x2="${W-P.r}" y1="${yk(tk)}" y2="${yk(tk)}" stroke="var(--kcal)" stroke-dasharray="4 4"/>`;
  if(tp)b+=`<line x1="${P.l}" x2="${W-P.r}" y1="${yp(tp)}" y2="${yp(tp)}" stroke="var(--protein)" stroke-dasharray="2 4"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${g}${b}</svg>`;
}
function renderProgress(){
  const ws=sortedWeights();
  $('#wChart').innerHTML=ws.length?lineChart([{pts:ws.map((w,i)=>({i,y:w.kg})),color:'var(--accent)',area:true,goal:+S.settings.goalWeight||null}],{labels:ws.map(w=>fmtShort(w.date)),yFmt:v=>r1(v)}):'<p class="empty">Your weight line appears here after your first weigh-in.</p>';
  if(ws.length>1){const a=ws[0],b=ws[ws.length-1],days=(parse(b.date)-parse(a.date))/864e5;const per=days>0?r1((b.kg-a.kg)/days*7):0;$('#wTrend').textContent=`${per>0?'+':''}${per} kg / week on average`}else $('#wTrend').textContent='';
  // weekly
  const dates=Object.keys(S.days).filter(d=>(S.days[d].meals||[]).length).sort();
  const weeks=[];if(dates.length){let w=weekStart(dates[0]);const end=weekStart(iso(new Date()));let guard=0;while(w<=end&&guard++<60){const s=weekStats(w);weeks.push({ws:w,k:s.k,p:s.p});w=addDays(w,7)}}
  $('#nChart').innerHTML=weeks.length?barChart(weeks.slice(-10)):'<p class="empty">Log meals for a few days and the weekly averages show up here.</p>';
  // exercises
  const ex={};Object.values(S.days).forEach(d=>{const w=d.workout;if(w&&w.type==='gym')(w.exercises||[]).forEach(e=>{if(e.weight==='')return;const k=e.name;(ex[k]=ex[k]||{})[d.date]=Math.max(ex[k][d.date]||0,+e.weight)})});
  const names=Object.keys(ex).sort();const cur=$('#exPick').value;
  $('#exPick').innerHTML=names.length?names.map(n=>`<option>${esc(n)}</option>`).join(''):'<option>No lifts yet</option>';
  if(names.includes(cur))$('#exPick').value=cur;
  const sel=$('#exPick').value;
  if(ex[sel]){const pts=Object.entries(ex[sel]).sort((a,b)=>a[0]<b[0]?-1:1);$('#exChart').innerHTML=lineChart([{pts:pts.map((p,i)=>({i,y:p[1]})),color:'var(--protein)'}],{labels:pts.map(p=>fmtShort(p[0])),yFmt:v=>r1(v)+''})+`<p class="status" style="margin:0">Heaviest working weight (kg) logged each session.</p>`}
  else $('#exChart').innerHTML='<p class="empty">Save a gym session with weights and each exercise gets its own progress line.</p>';
  // history
  const hs=Object.values(S.days).filter(d=>d.workout&&d.workout.type&&d.workout.type!=='rest').sort((a,b)=>a.date<b.date?1:-1).slice(0,20);
  $('#histRows').innerHTML=hs.length?hs.map(d=>{const w=d.workout;const det=w.type==='gym'?`${w.planName?'<strong>'+esc(w.planName)+'</strong> · ':''}${(w.exercises||[]).map(e=>esc(e.name)+(e.weight!==''?' '+e.weight+'kg':'')).join(', ')}`:esc([w.activity,w.minutes?w.minutes+' min':''].filter(Boolean).join(' · '));return`<tr><td class="num">${fmtShort(d.date)}</td><td><span class="chip ${w.type}">${w.type==='gym'?'Gym':'Street'}</span></td><td>${det}</td></tr>`}).join(''):'<tr><td colspan="3" class="empty">No sessions saved yet.</td></tr>';
}
$('#exPick').addEventListener('change',renderProgress);

function render(){renderPlates();if(S.tab==='today')renderToday();if(S.tab==='plan')renderPlan();if(S.tab==='progress')renderProgress();if(S.tab==='targets')renderTargets()}

try{const t=localStorage.getItem('fil-tab');if(t&&['today','plan','progress','targets'].includes(t))S.tab=t}catch(e){}
renderTabs();render();

// ---------- load + auth ----------
async function loadAll(){
  const [d,w,s]=await Promise.all([
    sb.from('days').select('date,meals,workout'),
    sb.from('weighins').select('date,kg'),
    sb.from('settings').select('*').maybeSingle()
  ]);
  const err=d.error||w.error||s.error;
  const ban=$('#noDb');
  if(err){ban.textContent='Couldn\'t load your data. Check your connection, then pull to refresh.';ban.hidden=false;return}
  ban.hidden=true;
  const days={};(d.data||[]).forEach(r=>days[r.date]={date:r.date,meals:r.meals||[],workout:r.workout||{type:'rest'}});
  const wi={};(w.data||[]).forEach(r=>wi[r.date]={date:r.date,kg:+r.kg});
  S.days=days;S.weighins=wi;
  const st=s.data;S.settings=st?{kcalTarget:st.kcal_target??'',proteinTarget:st.protein_target??'',goalWeight:st.goal_weight??'',plan:st.plan||[]}:{plan:[]};
  if(!S.trainDirty)S.draftDay=null;
  render();
}
function showApp(on){$('#booting').hidden=true;$('#app').hidden=!on;$('#auth').hidden=on}
async function onSession(session){
  user=session?session.user:null;
  if(!user){showApp(false);return}
  $('#whoami').textContent='Signed in as '+user.email;
  showApp(true);await loadAll();
}
sb.auth.getSession().then(({data})=>onSession(data.session));
sb.auth.onAuthStateChange((ev,session)=>{if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')onSession(session)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user&&!S.trainDirty)loadAll()});
$('#authForm').addEventListener('submit',async e=>{e.preventDefault();$('#aErr').textContent='';
  const {error}=await sb.auth.signInWithPassword({email:$('#aEmail').value.trim(),password:$('#aPass').value});
  if(error)$('#aErr').textContent=error.message==='Email not confirmed'?'Confirm your email first: open the link Supabase sent you, then sign in.':'Wrong email or password.';});
$('#aSignUp').addEventListener('click',async()=>{$('#aErr').textContent='';
  const email=$('#aEmail').value.trim(),password=$('#aPass').value;
  if(!email||password.length<6){$('#aErr').textContent='Enter an email and a password of at least 6 characters.';return}
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
  if(error){$('#aErr').textContent=error.message;return}
  if(!data.session)$('#aErr').textContent='Account created. Check your inbox and confirm your email, then sign in.';});
$('#signOut').addEventListener('click',()=>sb.auth.signOut());
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
