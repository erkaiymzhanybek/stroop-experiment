import {useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@supabase/supabase-js";


const VERSION="1.0.5";
const MAIN_TRIALS=48, PRACTICE_TRIALS=8, TIMEOUT=1500, FIXATION=200, INTER=200;
const COLORS={1:{name:"red",css:"#e53935"},2:{name:"green",css:"#22a447"},3:{name:"blue",css:"#1683ff"},4:{name:"yellow",css:"#f4d000"}};
const WORDS={kyrgyz:["КЫЗЫЛ","ЖАШЫЛ","КӨК","САРЫ"],russian:["КРАСНЫЙ","ЗЕЛЁНЫЙ","СИНИЙ","ЖЁЛТЫЙ"]};
type Lang="ru"|"ky"; type StudyLang="kyrgyz"|"russian"; type Block="practice"|"main";
type Trial={trialNumber:number;wordIndex:1|2|3|4;inkIndex:1|2|3|4;word:string;inkColor:string;condition:"congruent"|"incongruent"};
type RecordT={trialId:string;sessionId:string;participantId:string;language:StudyLang;block:Block;trialNumber:number;condition:"congruent"|"incongruent";rtMs:number|null;accuracy:boolean|null;response:string|null;timeout:boolean;word:string;inkColor:string;timestamp:string;experimentVersion:string};
type Scores={historyK:number;historyR:number;useK:number;useR:number;profK:number;profR:number;attK:number;attR:number;globalK:number;globalR:number;dominance:number;category:"kyrgyz_dominant"|"russian_dominant"|"balanced"};
type Participant={sessionId:string;participantId:string;preferredLanguage:Lang;age:number;gender:string;grewUpPlace:string;university:string;studyYear:string;blp:Record<string,number>;scores:Scores;group:1|2|null;first:StudyLang|null;second:StudyLang|null;startedAt:string;completedAt:string|null};

const supabase=(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY):null;
const saveQueue=(r:RecordT)=>{const q=JSON.parse(localStorage.getItem("stroop_queue")||"[]");q.push(r);localStorage.setItem("stroop_queue",JSON.stringify(q));};
const removeQueue=(id:string)=>{const q=JSON.parse(localStorage.getItem("stroop_queue")||"[]").filter((x:RecordT)=>x.trialId!==id);localStorage.setItem("stroop_queue",JSON.stringify(q));};
async function saveTrial(r:RecordT){saveQueue(r);if(!supabase)return;const {error}=await supabase.from("trials").upsert({trial_id:r.trialId,session_id:r.sessionId,participant_id:r.participantId,language:r.language,block:r.block,trial_number:r.trialNumber,condition:r.condition,rt_ms:r.rtMs,accuracy:r.accuracy,response:r.response,timeout:r.timeout,word:r.word,ink_color:r.inkColor,timestamp:r.timestamp,experiment_version:r.experimentVersion},{onConflict:"trial_id"});if(!error)removeQueue(r.trialId);}
async function flush(){if(!supabase)return;const q=JSON.parse(localStorage.getItem("stroop_queue")||"[]") as RecordT[];for(const r of q)await saveTrial(r);}

function score(blp:Record<string,number>):Scores{
 const sum=(lang:string,ns:number[])=>ns.reduce((a,n)=>a+(blp[`q${n}_${lang}`]??0),0);
 const historyK=sum("k",[1,2,3,4,5,6]),historyR=sum("r",[1,2,3,4,5,6]),useK=sum("k",[7,8,9,10,11]),useR=sum("r",[7,8,9,10,11]),profK=sum("k",[12,13,14,15]),profR=sum("r",[12,13,14,15]),attK=sum("k",[16,17,18,19]),attR=sum("r",[16,17,18,19]);
 const globalK=historyK*.454+useK*1.09+profK*2.27+attK*2.27,globalR=historyR*.454+useR*1.09+profR*2.27+attR*2.27,dominance=globalK-globalR;
 return {historyK,historyR,useK,useR,profK,profR,attK,attR,globalK,globalR,dominance,category:dominance>20?"kyrgyz_dominant":dominance<-20?"russian_dominant":"balanced"};
}
async function claimCounterbalanceGroup(sessionId:string,participantId:string):Promise<1|2|null>{
  if(!supabase){
    const key="stroop_local_counterbalance_count";
    const n=Number(localStorage.getItem(key)||"0");
    if(n>=60)return null;
    const assigned=(n<30?1:2) as 1|2;
    localStorage.setItem(key,String(n+1));
    return assigned;
  }
try {
    const { data, error } = await supabase.rpc("claim_counterbalance_group", {
      p_session_id: sessionId,
      p_participant_id: participantId
    });
    if (!error && (data === 1 || data === 2)) {
      return data;
    }
  } catch (e) {
    console.warn("RPC call failed, using fallback", e);
  }
  // Если вызов RPC не удался, выбираем случайную группу (1 или 2)
  return Math.random() < 0.5 ? 1 : 2;
}
function order(cat:Scores["category"],g:1|2):{first:StudyLang;second:StudyLang}|null{if(cat==="balanced")return null;if(g===1)return cat==="kyrgyz_dominant"?{first:"kyrgyz",second:"russian"}:{first:"russian",second:"kyrgyz"};return cat==="kyrgyz_dominant"?{first:"russian",second:"kyrgyz"}:{first:"kyrgyz",second:"russian"}}
function shuffle<T>(a:T[]){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
const congr=[1,2,3,4].map(i=>({w:i as 1|2|3|4,c:i as 1|2|3|4,co:"congruent" as const}));
const incon=[1,2,3,4].flatMap(w=>[1,2,3,4].filter(c=>c!==w).map(c=>({w:w as 1|2|3|4,c:c as 1|2|3|4,co:"incongruent" as const})));
function trials(lang:StudyLang,n=MAIN_TRIALS):Trial[]{const make=(src:any[],total:number)=>{const out:any[]=[];const per=total/4;for(const ink of [1,2,3,4]){const pool=shuffle(src.filter(x=>x.c===ink));for(let i=0;i<per;i++)out.push(pool[i%pool.length])}return out};return shuffle([...make(congr,n/2),...make(incon,n/2)]).map((x,i)=>({trialNumber:i+1,wordIndex:x.w,inkIndex:x.c,word:WORDS[lang][x.w-1],inkColor:COLORS[x.c].css,condition:x.co}))}
function practice(lang:StudyLang){return shuffle([...congr,...incon.slice(0,4)]).map((x,i)=>({trialNumber:i+1,wordIndex:x.w,inkIndex:x.c,word:WORDS[lang][x.w-1],inkColor:COLORS[x.c].css,condition:x.co}))}

const RU=`Название исследования: Когнитивный контроль в условиях доминирующего и недоминирующего языка у кыргызско-русских билингвальных студентов

Главный исследователь: Эркайым Жаныбекова, студентка факультета психологии АУЦА

Вас приглашают принять участие в исследовании когнитивного контроля у кыргызско-русских билингвальных студентов. Если вы согласитесь, вам необходимо будет заполнить короткую анкету о вашем языковом опыте и выполнить две компьютерные задачи — одну на кыргызском и одну на русском языке. В заданиях вам нужно будет определять цвет слова, игнорируя его значение. Участие займет около 18 минут.

Участие является полностью добровольным. Вы можете отказаться от участия или прекратить его в любой момент без объяснения причины и без каких-либо негативных последствий.

Исследование не предполагает рисков выше минимального. Возможны небольшая усталость или напряжение глаз при работе с экраном. При необходимости вы можете сделать перерыв или прекратить участие.

Ваши ответы, время реакции и точность выполнения заданий будут храниться конфиденциально и использоваться только для исследовательских целей. Результаты будут представлены в обобщенном виде, без информации, позволяющей идентифицировать вас.

Контакты: главный исследователь Эркайым Жаныбекова (ze12233@auca.kg)
По вопросам, связанным с этикой исследования, вы можете обратиться в Institutional Review Board (IRB) Американского университета Центральной Азии (irb@auca.kg)

Для участия вам должно быть 18 лет или больше.

Нажимая «Согласен», я подтверждаю, что прочитал(а) и понял(а) приведенную выше информацию и добровольно соглашаюсь принять участие в исследовании.`;
const KY=`Изилдөөнүн аталышы: Кыргыз-орус билингвалдуу студенттердин басымдуу жана басымдуу эмес тил шарттарындагы когнитивдик көзөмөлү

Башкы изилдөөчү: Эркайым Жаныбекова, БААУ психология факультетинин студенти

Сиз кыргыз-орус билингвалдуу студенттердеги когнитивдик көзөмөлдү изилдөөгө катышууга чакырыласыз. Эгер катышууга макул болсоңуз, тилдик тажрыйбаңыз тууралуу кыска сурамжылоо толтуруп, эки компьютердик тапшырманы — бирин кыргыз тилинде, экинчисин орус тилинде — аткарасыз. Тапшырмаларда сөздүн маанисине көңүл бурбастан, анын түсүн аныктоо керек болот. Изилдөөгө катышуу болжол менен 18 мүнөттү талап кылат.

Катышуу толугу менен ыктыярдуу. Сиз эч кандай себеп түшүндүрбөстөн катышуудан баш тарта аласыз же каалаган учурда катышууну токтото аласыз. Бул сиз үчүн эч кандай терс кесепеттерге алып келбейт.

Изилдөө минималдуу деңгээлден жогору тобокелдиктерди камтыбайт. Экран менен иштөөгө байланыштуу көздүн чарчоосу же жеңил ыңгайсыздык болушу мүмкүн. Зарыл болсо, тыныгуу алып же катышууну токтото аласыз.

Сурамжылоодогу жоопторуңуз, реакция убактыңыз жана тапшырмаларды аткаруудагы тактыгыңыз купуя сакталат жана изилдөө максаттарында гана колдонулат. Жыйынтыктар сизди аныктоого мүмкүндүк бербеген жалпыланган түрдө гана берилет.

Байланыш үчүн: башкы изилдөөчү Эркайым Жаныбекова (ze12233@auca.kg)
Изилдөөнүн этикасына байланыштуу суроолоруңуз болсо, Америка университетинин Борбордук Азиядагы Institutional Review Board (IRB) комитетине кайрылсаңыз болот: irb@auca.kg

Катышуу үчүн сиз 18 жашта же андан улуу болушуңуз керек.

«Макулмун» баскычын басуу менен мен жогорудагы маалыматты окуп, түшүнгөнүмдү жана изилдөөгө өз каалоом менен катышууга макул экенимди ырастайм.`;

const ages=Array.from({length:8},(_,i)=>i+18);
const pct=Array.from({length:11},(_,i)=>i);
const scale=Array.from({length:7},(_,i)=>i);
const years=Array.from({length:21},(_,i)=>i);
const ageScore=[20,...Array.from({length:19},(_,i)=>19-i),0];
const comfortScore=[20,...Array.from({length:19},(_,i)=>19-i),0];

function Button(p:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className="btn" {...p}/>}

function Language({pick}:{pick:(x:Lang)=>void}){return <section className="card center"><h1>Когнитивдик көзөмөл / Когнитивный контроль</h1><p>Сураныч, сизге ыңгайлуу тилди тандаңыз / Пожалуйста, выберите удобный для вас язык.</p><div className="two"><Button onClick={()=>pick("ky")}>Кыргыз тили</Button><Button onClick={()=>pick("ru")}>Русский язык</Button></div></section>}

function Consent({l,accept,decline}:{l:Lang;accept:()=>void;decline:()=>void}){const title=l==="ru"?"ФОРМА ИНФОРМИРОВАННОГО СОГЛАСИЯ":"МААЛЫМДАЛГАН МАКУЛДУК ФОРМАСЫ";return <section className="card"><h1>{title}</h1><div className="consent">{l==="ru"?RU:KY}</div><Button onClick={accept}>Я согласен(-на) / Мен изилдөөгө катышууга макулмун</Button><button className="secondary" onClick={decline}>Я не согласен(-на) / Мен изилдөөгө катышууга макул эмесмин</button></section>}

function Demographics({submit}:{submit:(x:any)=>void}){const [f,set]=useState({age:18,gender:"",place:"",university:"",year:""});const ok=f.gender&&f.place&&f.university&&f.year;return <section className="card"><h1>Демографические вопросы / Демография</h1><label>Возраст / Жашыңыз<select value={f.age} onChange={e=>set({...f,age:+e.target.value})}>{ages.map(x=><option key={x}>{x}</option>)}</select></label><label>Пол / Жынысыңыз<select value={f.gender} onChange={e=>set({...f,gender:e.target.value})}><option value="">—</option><option>Мужчина / Эркек</option><option>Женщина / Аял</option><option>Другое / Башка</option></select></label><label>Где вы преимущественно выросли? / Сиз негизинен кайсы жерде чоңоюп-өстүңүз?<input value={f.place} onChange={e=>set({...f,place:e.target.value})}/></label><label>Название вашего университета / Университеттин аталышы<input value={f.university} onChange={e=>set({...f,university:e.target.value})}/></label><label>Ваш год обучения / Окуу жылыңыз<select value={f.year} onChange={e=>set({...f,year:e.target.value})}><option value="">—</option>{["1 курс","2 курс","3 курс","4 курс","5 курс или выше / 5-курс же андан жогору"].map(x=><option key={x}>{x}</option>)}</select></label><Button disabled={!ok} onClick={()=>submit(f)}>Продолжить / Улантуу</Button></section>}

function BLP({done}:{done:(b:Record<string,number>)=>void}){
 const [a,setA]=useState<Record<string,number>>({});
 const [index,setIndex]=useState(0);
 const ageOpts: [string,number][] = [["С рождения / Туулгандан бери",20], ...Array.from({length:19},(_,i)=>[String(i+1),19-i] as [string,number]), ["20+",0]];
 const comfort: [string,number][] = [["С тех пор как я себя помню / Өзүмдү эстегенден бери",20], ...Array.from({length:19},(_,i)=>[String(i+1),19-i] as [string,number]), ["20+",0]];
 const yr: [string,number][] = Array.from({length:21},(_,i)=>i<20 ? [String(i),i] as [string,number] : ["20+",20] as [string,number]);
 const pc: [string,number][] = Array.from({length:11},(_,i)=>[`${i*10}%`,i] as [string,number]);
 const sc: [string,number][] = Array.from({length:7},(_,i)=>[String(i),i] as [string,number]);
 const pairs:any[]=[
 [1,"В каком возрасте вы начали изучать кыргызский язык? / Кыргыз тилин канча жашыңыздан баштап үйрөнө баштадыңыз?","В каком возрасте вы начали изучать русский язык? / Орус тилин канча жашыңыздан баштап үйрөнө баштадыңыз?",ageOpts],
 [2,"В каком возрасте вы начали чувствовать себя комфортно, используя кыргызский язык? / Кыргыз тилин колдонууда өзүңүздү ыңгайлуу сезе баштаган убактыңыз канча жашыңызда болгон?","В каком возрасте вы начали чувствовать себя комфортно, используя русский язык? / Орус тилин колдонууда өзүңүздү ыңгайлуу сезе баштаган убактыңыз канча жашыңызда болгон?",comfort],
 [3,"Сколько лет вы обучались на кыргызском языке (история, математика и т. д.) с начальной школы до университета? / Кыргыз тилинде башталгыч мектептен университетке чейин канча жыл билим алдыңыз (тарых, математика ж.б.)?","Сколько лет вы обучались на русском языке (история, математика и т. д.) с начальной школы до университета? / Орус тилинде башталгыч мектептен университетке чейин канча жыл билим алдыңыз (тарых, математика ж.б.)?",yr],
 [4,"Сколько лет вы провели в стране/регионе, где говорят на кыргызском языке? / Кыргыз тили сүйлөнгөн өлкөдө/аймакта канча жыл өткөрдүңүз?","Сколько лет вы провели в стране/регионе, где говорят на русском языке? / Орус тили сүйлөнгөн өлкөдө/аймакта канча жыл өткөрдүңүз?",yr],
 [5,"Сколько лет вы провели в семье, где говорят на кыргызском языке? / Кыргыз тили сүйлөнгөн үй-бүлөдө канча жыл өткөрдүңүз?","Сколько лет вы провели в семье, где говорят на русском языке? / Орус тили сүйлөнгөн үй-бүлөдө канча жыл өткөрдүңүз?",yr],
 [6,"Сколько лет вы провели в рабочей среде, где говорят на кыргызском языке? / Кыргыз тили сүйлөнгөн жумуш чөйрөсүндө канча жыл өткөрдүңүз?","Сколько лет вы провели в рабочей среде, где говорят на русском языке? / Орус тили сүйлөнгөн жумуш чөйрөсүндө канча жыл өткөрдүңүз?",yr],
 [7,"В течение обычной недели какой процент времени вы используете кыргызский язык при общении с друзьями? / Кадимки жуманын ичинде досторуңуз менен сүйлөшкөндө убактыңыздын канча пайызында кыргыз тилин колдоносуз?","В течение обычной недели какой процент времени вы используете русский язык при общении с друзьями? / Кадимки жуманын ичинде досторуңуз менен сүйлөшкөндө убактыңыздын канча пайызында орус тилин колдоносуз?",pc],
 [8,"В течение обычной недели какой процент времени вы используете кыргызский язык при общении с семьёй? / Кадимки жуманын ичинде үй-бүлөңүз менен сүйлөшкөндө убактыңыздын канча пайызында кыргыз тилин колдоносуз?","В течение обычной недели какой процент времени вы используете русский язык при общении с семьёй? / Кадимки жуманын ичинде үй-бүлөңүз менен сүйлөшкөндө убактыңыздын канча пайызында орус тилин колдоносуз?",pc],
 [9,"В течение обычной недели какой процент времени вы используете кыргызский язык в учебной/рабочей среде? / Кадимки жуманын ичинде окуу/жумуш чөйрөсүндө убактыңыздын канча пайызында кыргыз тилин колдоносуз?","В течение обычной недели какой процент времени вы используете русский язык в учебной/рабочей среде? / Кадимки жуманын ичинде окуу/жумуш чөйрөсүндө убактыңыздын канча пайызында орус тилин колдоносуз?",pc],
 [10,"Когда вы разговариваете сами с собой, как часто вы делаете это на кыргызском языке? / Өзүңүз менен өзүңүз сүйлөшкөндө, канчалык көп кыргыз тилинде сүйлөйсүз?","Когда вы разговариваете сами с собой, как часто вы делаете это на русском языке? / Өзүңүз менен өзүңүз сүйлөшкөндө, канчалык көп орус тилинде сүйлөйсүз?",pc],
 [11,"Когда вы считаете, как часто вы считаете на кыргызском языке? / Эсептегенде, канчалык көп кыргыз тилинде эсептейсиз?","Когда вы считаете, как часто вы считаете на русском языке? / Эсептегенде, канчалык көп орус тилинде эсептейсиз?",pc],
 [12,"Насколько хорошо вы говорите на кыргызском языке? / Кыргыз тилинде канчалык жакшы сүйлөйсүз?","Насколько хорошо вы говорите на русском языке? / Орус тилинде канчалык жакшы сүйлөйсүз?",sc],
 [13,"Насколько хорошо вы понимаете кыргызский язык? / Кыргыз тилин канчалык жакшы түшүнөсүз?","Насколько хорошо вы понимаете русский язык? / Орус тилин канчалык жакшы түшүнөсүз?",sc],
 [14,"Насколько хорошо вы читаете на кыргызском языке? / Кыргыз тилинде канчалык жакшы окуйсуз?","Насколько хорошо вы читаете на русском языке? / Орус тилинде канчалык жакшы окуйсуз?",sc],
 [15,"Насколько хорошо вы пишете на кыргызском языке? / Кыргыз тилинде канчалык жакшы жазасыз?","Насколько хорошо вы пишете на русском языке? / Орус тилинде канчалык жакшы жазасыз?",sc],
 [16,"Я чувствую себя собой, когда говорю на кыргызском языке. / Кыргыз тилинде сүйлөгөндө өзүмдү эркин сезем.","Я чувствую себя собой, когда говорю на русском языке. / Орус тилинде сүйлөгөндө өзүмдү эркин сезем.",sc],
 [17,"Я идентифицирую себя с кыргызскоязычной культурой. / Мен өзүмдү кыргыз тилдүү маданиятка таандык деп эсептейм.","Я идентифицирую себя с русскоязычной культурой. / Мен өзүмдү орус тилдүү маданиятка таандык деп эсептейм.",sc],
 [18,"Для меня важно говорить (или со временем говорить) на кыргызском языке как носитель языка. / Мен үчүн кыргыз тилинде эне тилинде сүйлөгөн адамдай сүйлөө (же убакыттын өтүшү менен сүйлөй алуу) маанилүү.","Для меня важно говорить (или со временем говорить) на русском языке как носитель языка. / Мен үчүн орус тилинде эне тилинде сүйлөгөн адамдай сүйлөө (же убакыттын өтүшү менен сүйлөй алуу) маанилүү.",sc],
 [19,"Я хочу, чтобы другие считали меня носителем кыргызского языка. / Башкалар мени кыргыз тилинин эне тилдүү сүйлөөчүсү деп эсептешин каалайм.","Я хочу, чтобы другие считали меня носителем русского языка. / Башкалар мени орус тилинин эне тилдүү сүйлөөчүсү деп эсептешин каалайм.",sc]
 ];
 const items=pairs.flatMap(x=>[[x[0],"k",x[1],x[3]],[x[0],"r",x[2],x[3]]] as [number,"k"|"r",string,[string,number][]][]);
 const item=items[index];
 const key=`q${item[0]}_${item[1]}`;
 const section=item[0]<=6?"II. ЯЗЫКОВАЯ ИСТОРИЯ / ТИЛДИК ТАРЫХ":item[0]<=11?"III. ИСПОЛЬЗОВАНИЕ ЯЗЫКА / ТИЛДЕРДИ КОЛДОНУУ":item[0]<=15?"IV. ЯЗЫКОВАЯ КОМПЕТЕНТТҮҮЛҮК / ТИЛДИК КОМПЕТЕНТТҮҮЛҮК":"V. ОТНОШЕНИЕ К ЯЗЫКАМ / ТИЛДЕРГЕ МАМИЛЕ";
 const choose=(s:number)=>setA(prev=>({...prev,[key]:s}));
 const next=()=>{if(a[key]===undefined)return; if(index===items.length-1)done(a); else setIndex(i=>i+1)};
 return <section className="card blp-one"><div className="progressHead"><span>{section}</span><b>{index+1} / {items.length}</b></div><div className="progress"><div style={{width:`${((index+1)/items.length)*100}%`}}/></div><p className="muted">Ответьте на вопрос, затем нажмите «Далее». Пропустить вопрос нельзя.</p><fieldset className="blp-question"><legend><b>Вопрос {index+1}</b></legend><p className="questionText">{item[2]}</p><div className="opts single">{item[3].map(([label,s])=><label className="opt" key={label}><input type="radio" name={key} checked={a[key]===s} onChange={()=>choose(s)}/><span>{label}</span></label>)}</div></fieldset><Button disabled={a[key]===undefined} onClick={next}>{index===items.length-1?"Завершить / Аяктоо":"Далее / Кийинки"}</Button></section>
}
function Stroop({p,l,b,ts,done,uiLang}:{p:Participant;l:StudyLang;b:Block;ts:Trial[];done:(r:RecordT[])=>void;uiLang:Lang}){
 const [phase,setPhase]=useState<"intro"|"fix"|"stim"|"feedback">("intro");
 const [i,setI]=useState(0);
 const [fb,setFb]=useState<string|null>(null);
 const onset=useRef(0);
 const responded=useRef(false);
 const timer=useRef<number|undefined>(undefined);
 const outRef=useRef<RecordT[]>([]);
 const tr=ts[i];
 useEffect(()=>()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)},[]);
 useEffect(()=>{
   if(phase!=="fix"||!tr)return;
   timer.current=window.setTimeout(()=>setPhase("stim"),FIXATION);
   return ()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)};
 },[phase,i]);
 useEffect(()=>{
   if(phase!=="stim"||!tr)return;
   onset.current=performance.now();
   responded.current=false;
   timer.current=window.setTimeout(()=>{if(responded.current)return;responded.current=true;record(null,null,true)},TIMEOUT);
   return ()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)};
 },[phase,i]);
 useEffect(()=>{
   if(phase!=="feedback")return;
   timer.current=window.setTimeout(()=>advance(),600);
   return ()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)};
 },[phase]);
 const advance=()=>{
   if(i===ts.length-1){done(outRef.current);return}
   timer.current=window.setTimeout(()=>{setI(x=>x+1);setPhase("fix")},INTER);
 };
 const record=(resp:string|null,acc:boolean|null,timeout:boolean)=>{
   if(!tr||phase!=="stim")return;
   if(timer.current!==undefined)window.clearTimeout(timer.current);
   const r:RecordT={trialId:crypto.randomUUID(),sessionId:p.sessionId,participantId:p.participantId,language:l,block:b,trialNumber:tr.trialNumber,condition:tr.condition,rtMs:timeout?null:performance.now()-onset.current,accuracy:acc,response:resp,timeout,word:tr.word,inkColor:tr.inkColor,timestamp:new Date().toISOString(),experimentVersion:VERSION};
   outRef.current=[...outRef.current,r];
   void saveTrial(r);
   // Feedback is localized to the language of the Stroop block itself.
   // In the main task, only a timeout receives feedback; correct/incorrect
   // responses remain without feedback as specified by the protocol.
   if(b==="practice" || timeout){
     setFb(l==="russian"?(timeout?"Слишком медленно":acc?"Правильно":"Неправильно"):(timeout?"Өтө жай":acc?"Туура":"Туура эмес"));
     setPhase("feedback");
   }else{
     advance();
   }
 };
 const start=()=>setPhase("fix");
 if(phase==="intro")return <section className="card center"><h1>{l==="kyrgyz"?"Кыргыз тили":"Русский язык"}</h1>{b==="practice"?<><p>{uiLang==="ru"?`Сейчас вы будете выполнять задание на ${l==="kyrgyz"?"кыргызском":"русском"} языке.`:`Азыр сиз ${l==="kyrgyz"?"кыргыз":"орус"} тилиндеги тапшырманы аткарасыз.`}</p><p>{uiLang==="ru"?"Сначала вы пройдете тренировку с проверкой ошибок, а затем — основное задание без подсказок.":"Алгач каталарды көрсөтүү менен машыгуу болот, андан соң негизги тапшырма башталат."}</p></>:<p>{uiLang==="ru"?"Теперь начинается основная часть. Определяйте ЦВЕТ слова, игнорируя его значение.":"Эми негизги бөлүк башталат. Сөздүн ТҮСҮН аныктап, анын маанисине көңүл бурбаңыз."}</p>}<Button onClick={start}>{uiLang==="ru"?"Начать":"Баштоо"}</Button></section>;
 return <section className="stroop"><div className="top"><span>{l==="kyrgyz"?"Кыргыз тили":"Русский язык"}</span><span>{i+1} / {ts.length}</span></div><div className="stimArea">{phase==="fix"&&<div className="fix">+</div>}{phase==="stim"&&<div className="word" style={{color:tr.inkColor}}>{tr.word}</div>}{phase==="feedback"&&<div className="feedback">{fb}</div>}</div><div className="colors">{[1,2,3,4].map(c=><button key={c} disabled={phase!=="stim"} aria-label={COLORS[c as 1|2|3|4].name} style={{background:COLORS[c as 1|2|3|4].css}} onClick={()=>{if(responded.current)return;responded.current=true;record(COLORS[c as 1|2|3|4].name,c===tr.inkIndex,false)}}/>)}</div></section>
}
function Summary({results,finish}:{results:RecordT[];finish:()=>void}){const s=(l:StudyLang)=>{const x=results.filter(r=>r.language===l&&r.block==="main"),valid=x.filter(r=>r.accuracy&&r.rtMs!==null).map(r=>r.rtMs as number),c=x.filter(r=>r.accuracy&&r.condition==="congruent"&&r.rtMs!==null).map(r=>r.rtMs as number),ic=x.filter(r=>r.accuracy&&r.condition==="incongruent"&&r.rtMs!==null).map(r=>r.rtMs as number),av=(z:number[])=>z.length?z.reduce((a,b)=>a+b,0)/z.length:null;return{acc:x.length?x.filter(r=>r.accuracy).length/x.length*100:0,rt:av(valid),effect:(av(ic)!==null&&av(c)!==null)?av(ic)!-av(c)!:null}};const k=s("kyrgyz"),r=s("russian");return <section className="card"><h1>Спасибо за участие! / Катышканыңыз үчүн рахмат!</h1><p>Вы завершили исследование. Ниже — краткое описание вашего выполнения.</p><div className="results"><div><h2>Кыргыз тили</h2><p>Точность выполнения: <b>{k.acc.toFixed(1)}%</b></p><p>Среднее время реакции: <b>{k.rt===null?"—":k.rt.toFixed(0)+" мс"}</b></p><p>Эффект Струпа: <b>{k.effect===null?"—":k.effect.toFixed(0)+" мс"}</b></p></div><div><h2>Русский язык</h2><p>Точность выполнения: <b>{r.acc.toFixed(1)}%</b></p><p>Среднее время реакции: <b>{r.rt===null?"—":r.rt.toFixed(0)+" мс"}</b></p><p>Эффект Струпа: <b>{r.effect===null?"—":r.effect.toFixed(0)+" мс"}</b></p></div></div><p className="muted">Этот результат описывает выполнение задания и не является диагностической оценкой.</p><Button onClick={finish}>Завершить</Button></section>}

function App(){const [screen,setScreen]=useState("language");const [lang,setLang]=useState<Lang>("ru");const [p,setP]=useState<Participant|null>(null);const [current,setCurrent]=useState<StudyLang|null>(null);const [block,setBlock]=useState<Block>("practice");const [ts,setTs]=useState<Trial[]>([]);const [all,setAll]=useState<RecordT[]>([]);
useEffect(()=>{void flush()},[]);
const accept=()=>setScreen("id"),decline=()=>setScreen("declined");
const makeP=(id:string)=>{const base:Participant={sessionId:crypto.randomUUID(),participantId:id,preferredLanguage:lang,age:18,gender:"",grewUpPlace:"",university:"",studyYear:"",blp:{},scores:score({}),group:null,first:null,second:null,startedAt:new Date().toISOString(),completedAt:null};setP(base);setScreen("demographics")};
const afterDemo=(d:any)=>{if(!p)return;setP({...p,age:d.age,gender:d.gender,grewUpPlace:d.place,university:d.university,studyYear:d.year});setScreen("blp")};
const afterBlp=async(blp:Record<string,number>)=>{if(!p)return;const sc=score(blp);if(sc.category==="balanced"){const np={...p,blp,scores:sc,group:null,first:null,second:null};setP(np);if(supabase)await supabase.from("participants").upsert({session_id:np.sessionId,participant_id:np.participantId,preferred_language:np.preferredLanguage,age:np.age,gender:np.gender,grew_up_place:np.grewUpPlace,university:np.university,study_year:np.studyYear,blp_responses:np.blp,history_kyrgyz:sc.historyK,history_russian:sc.historyR,use_kyrgyz:sc.useK,use_russian:sc.useR,proficiency_kyrgyz:sc.profK,proficiency_russian:sc.profR,attitudes_kyrgyz:sc.attK,attitudes_russian:sc.attR,global_kyrgyz:sc.globalK,global_russian:sc.globalR,dominance_index:sc.dominance,dominance_category:sc.category,counterbalance_group:null,first_language:null,second_language:null,experiment_version:VERSION,started_at:np.startedAt,completed_at:new Date().toISOString()},{onConflict:"session_id"});setScreen("balanced");return}let g:1|2|null=null;try{g=await claimCounterbalanceGroup(p.sessionId,p.participantId)}catch(e){console.error(e);setScreen("connectionError");return}if(g===null){const np={...p,blp,scores:sc,group:null,first:null,second:null};setP(np);if(supabase)await supabase.from("participants").upsert({session_id:np.sessionId,participant_id:np.participantId,preferred_language:np.preferredLanguage,age:np.age,gender:np.gender,grew_up_place:np.grewUpPlace,university:np.university,study_year:np.studyYear,blp_responses:np.blp,history_kyrgyz:sc.historyK,history_russian:sc.historyR,use_kyrgyz:sc.useK,use_russian:sc.useR,proficiency_kyrgyz:sc.profK,proficiency_russian:sc.profR,attitudes_kyrgyz:sc.attK,attitudes_russian:sc.attR,global_kyrgyz:sc.globalK,global_russian:sc.globalR,dominance_index:sc.dominance,dominance_category:sc.category,counterbalance_group:null,first_language:null,second_language:null,experiment_version:VERSION,started_at:np.startedAt,completed_at:new Date().toISOString()},{onConflict:"session_id"});setScreen("targetFull");return}const o=order(sc.category,g),np={...p,blp,scores:sc,group:g,first:o?.first??null,second:o?.second??null};setP(np);if(supabase){const {error}=await supabase.from("participants").upsert({session_id:np.sessionId,participant_id:np.participantId,preferred_language:np.preferredLanguage,age:np.age,gender:np.gender,grew_up_place:np.grewUpPlace,university:np.university,study_year:np.studyYear,blp_responses:np.blp,history_kyrgyz:sc.historyK,history_russian:sc.historyR,use_kyrgyz:sc.useK,use_russian:sc.useR,proficiency_kyrgyz:sc.profK,proficiency_russian:sc.profR,attitudes_kyrgyz:sc.attK,attitudes_russian:sc.attR,global_kyrgyz:sc.globalK,global_russian:sc.globalR,dominance_index:sc.dominance,dominance_category:sc.category,counterbalance_group:g,first_language:o?.first??null,second_language:o?.second??null,experiment_version:VERSION,started_at:np.startedAt,completed_at:null},{onConflict:"session_id"});if(error){console.error(error);setScreen("connectionError");return}}setCurrent(o!.first);setBlock("practice");setTs(practice(o!.first));setScreen("stroop")};
const stroopDone=(rs:RecordT[])=>{setAll(x=>[...x,...rs]);if(block==="practice"){setBlock("main");setTs(trials(current!));return}if(current===p!.first){setCurrent(p!.second);setBlock("practice");setTs(practice(p!.second));setScreen("break");return}setScreen("summary")};
const finish=async()=>{if(p&&supabase)await supabase.from("participants").update({completed_at:new Date().toISOString()}).eq("session_id",p.sessionId);setScreen("finished")};
const startSecond=()=>setScreen("stroop");
let view:any;switch(screen){case"language":view=<Language pick={x=>{setLang(x);setScreen("consent")}}/>;break;case"consent":view=<Consent l={lang} accept={accept} decline={decline}/>;break;case"id":view=<section className="card"><h1>Participant ID</h1><p>Пожалуйста, введите ваш код участника.</p><input autoFocus id="pid"/><Button onClick={()=>{const v=(document.getElementById("pid") as HTMLInputElement).value.trim();if(v)makeP(v)}}>Продолжить</Button></section>;break;case"demographics":view=<Demographics submit={afterDemo}/>;break;case"blp":view=<BLP done={afterBlp}/>;break;case"stroop":view=<Stroop key={`${current}-${block}`} p={p!} l={current!} b={block} ts={ts} done={stroopDone} uiLang={lang}/>;break;case"break":view=<section className="card center"><h1>Короткий перерыв / Кыска тыныгуу</h1><p>Сделайте короткий перерыв. Когда будете готовы, продолжите.</p><p>Кичине эс алып алыңыз. Даяр болгондо улантыңыз.</p><Button onClick={startSecond}>Продолжить / Улантуу</Button></section>;break;case"balanced":view=<section className="card center"><h1>Спасибо за участие!</h1><p>По результатам языкового опросника ваш профиль соответствует сбалансированному билингвизму. На этом участие завершается.</p><Button onClick={finish}>Завершить</Button></section>;break;case"targetFull":view=<section className="card center"><h1>Спасибо за участие!</h1><p>Основной набор участников для этого исследования уже завершён. Ваши ответы на языковой опросник сохранены.</p><Button onClick={finish}>Завершить</Button></section>;break;case"connectionError":view=<section className="card center"><h1>Не удалось сохранить данные</h1><p>Пожалуйста, проверьте подключение к интернету и сообщите исследователю. Не закрывайте страницу, пока не получите дальнейшие инструкции.</p></section>;break;case"summary":view=<Summary results={all} finish={finish}/>;break;case"declined":view=<section className="card center"><h1>Спасибо за ваше время.</h1><p>Вы не согласились участвовать в исследовании, поэтому участие завершено.</p></section>;break;default:view=<section className="card center"><h1>Спасибо!</h1><p>Ваше участие завершено.</p></section>}return <main>{view}</main>}
export default App;
