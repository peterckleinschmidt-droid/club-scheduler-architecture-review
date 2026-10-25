"use server";
import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { getAnnualSetupStatusForActiveYear } from '@/lib/annual-setup';
export type NextBlockOverview = { ok:boolean; message:string; yearLabel?:string; currentBlock?:{id:string;label:string;status:string|null}|null; blocks?:Array<{id:string;label:string;status:string|null;isCurrent:boolean}>; suggestedLabel?:string };
export type StartNextBlockResult = { ok:boolean; message:string; blockId?:string };
function revalidateNextBlockPaths(){['/admin','/admin/blocks','/admin/blocks/next','/admin/clubs','/admin/workflow','/admin/google-workspace','/admin/prepare-form'].forEach((path)=>revalidatePath(path));}
function blockNumber(label:unknown){const match=String(label??'').match(/(?:block|session)\s*(\d+)/i);return match?Number(match[1]):0;}
export async function getNextBlockOverview():Promise<NextBlockOverview>{
  await requireRole(['admin']); const admin=createAdminClient(); const {year,block}=await getActiveContext();
  if(!year)return{ok:false,message:'Set an active school year before starting another session.'};
  const {data,error}=await admin.from('blocks').select('*').eq('school_year_id',year.id);
  if(error)return{ok:false,message:`Could not load sessions: ${error.message}`};
  const blocks=(data??[]).map((row:any)=>({id:row.id as string,label:String(row.label??'Untitled session'),status:row.status?String(row.status):null,isCurrent:Boolean(row.is_current)})).sort((a,b)=>blockNumber(a.label)-blockNumber(b.label)||a.label.localeCompare(b.label,undefined,{numeric:true}));
  const highest=blocks.reduce((max,item)=>Math.max(max,blockNumber(item.label)),0);
  return{ok:true,message:'Create the next session, then continue through its setup checklist.',yearLabel:year.label,currentBlock:block?{id:block.id,label:block.label,status:block.status??null}:null,blocks,suggestedLabel:`Session ${Math.max(1,highest+1)}`};
}
export async function startNextBlock({label}:{label:string}):Promise<StartNextBlockResult>{
  await requireRole(['admin']); const admin=createAdminClient(); const {year}=await getActiveContext(); const cleanLabel=String(label??'').trim().replace(/\s+/g,' ');
  if(!year)return{ok:false,message:'Set an active school year before starting another session.'};
  if(!cleanLabel)return{ok:false,message:'Enter a name for the new session.'};
  const {data:existing,error:existingError}=await admin.from('blocks').select('id, label').eq('school_year_id',year.id);
  if(existingError)return{ok:false,message:`Could not check existing sessions: ${existingError.message}`};
  if((existing??[]).length===0){const setup=await getAnnualSetupStatusForActiveYear();if(!setup.annualSetupComplete)return{ok:false,message:'Finish annual setup and confirm the Google homeroom list before creating the first session.'};}
  if((existing??[]).some((row:any)=>String(row.label??'').trim().toLowerCase()===cleanLabel.toLowerCase()))return{ok:false,message:`A session named “${cleanLabel}” already exists in this school year.`};
  const clearCurrent=await admin.from('blocks').update({is_current:false}).eq('school_year_id',year.id).eq('is_current',true);
  if(clearCurrent.error)return{ok:false,message:`Could not change the current session: ${clearCurrent.error.message}`};
  const {data:created,error:createError}=await admin.from('blocks').insert({school_year_id:year.id,label:cleanLabel,is_current:true}).select('id').single();
  if(createError||!created?.id)return{ok:false,message:`Could not create the new session: ${createError?.message??'Unknown error'}`};
  revalidateNextBlockPaths(); return{ok:true,blockId:created.id,message:`${cleanLabel} was created and is now the current session. Previous sessions were left unchanged.`};
}
