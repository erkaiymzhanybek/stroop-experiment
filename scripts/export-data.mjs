import "dotenv/config";
import {createClient} from "@supabase/supabase-js";
import * as XLSX from "xlsx";
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");process.exit(1);}
const db=createClient(url,key);
const {data:p,error:pe}=await db.from("participants").select("*").order("created_at");
if(pe)throw pe;
const {data:t,error:te}=await db.from("trials").select("*").order("created_at");
if(te)throw te;
const pm=new Map((p??[]).map(x=>[x.session_id,x]));
const rows=(t??[]).map(x=>{const a=pm.get(x.session_id)||{};return {
session_id:x.session_id,participant_id:x.participant_id,age:a.age??"",gender:a.gender??"",grew_up_place:a.grew_up_place??"",university:a.university??"",study_year:a.study_year??"",
preferred_language:a.preferred_language??"",history_kyrgyz:a.history_kyrgyz??"",history_russian:a.history_russian??"",use_kyrgyz:a.use_kyrgyz??"",use_russian:a.use_russian??"",
proficiency_kyrgyz:a.proficiency_kyrgyz??"",proficiency_russian:a.proficiency_russian??"",attitudes_kyrgyz:a.attitudes_kyrgyz??"",attitudes_russian:a.attitudes_russian??"",
global_kyrgyz:a.global_kyrgyz??"",global_russian:a.global_russian??"",dominance_index:a.dominance_index??"",dominance_category:a.dominance_category??"",
counterbalance_group:a.counterbalance_group??"",first_language:a.first_language??"",second_language:a.second_language??"",
experiment_version:x.experiment_version,block:x.block,language:x.language,trial_number:x.trial_number,condition:x.condition,rt_ms:x.rt_ms,accuracy:x.accuracy,response:x.response,timeout:x.timeout,word:x.word,ink_color:x.ink_color,timestamp:x.timestamp
};});
const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);
ws["!cols"]=Object.keys(rows[0]??{}).map(k=>({wch:Math.min(28,Math.max(12,k.length+2))}));
XLSX.utils.book_append_sheet(wb,ws,"Study Data");
XLSX.writeFile(wb,"study_data.xlsx");
console.log(`Created study_data.xlsx with ${rows.length} trial rows.`);
