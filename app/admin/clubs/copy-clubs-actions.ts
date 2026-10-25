'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateClubOffering } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export type CopyClubOption = { id:string; blockId:string; blockLabel:string; clubTitle:string; sectionLabel:string|null; sponsorName:string|null; meetingDays:string[]; capacityType:string|null; maxCapacity:number|null; gradeLimited:boolean; eligibleGrades:number[] };
export type CopyOptionsResult = { ok:boolean; message:string; blocks?:Array<{id:string;label:string;clubCount:number}>; clubs?:CopyClubOption[] };
export type CopyResult = { ok:boolean; message:string; copiedCount?:number; skippedNames?:string[] };

function norm(v:unknown){return String(v??'').trim().replace(/\s+/g,' ').toLowerCase();}
function key(t:unknown,s:unknown){return `${norm(t)}|${norm(s)}`;}
function name(t:unknown,s:unknown){const title=String(t??'').trim()||'Untitled club';const section=String(s??'').trim();return section?`${title} (${section})`:title;}
function refresh(){['/admin','/admin/blocks','/admin/clubs','/admin/workflow','/admin/prepare-form'].forEach((path) => revalidatePath(path));}

export async function getCopyClubOptions():Promise<CopyOptionsResult>{
  await requireRole(['admin']);
  const db=createAdminClient();
  const {year,block}=await getActiveContext();
  if(!year||!block)return{ok:false,message:'Set an active school year and current session before copying clubs.'};
  const [{data:blocks,error:be},{data:clubs,error:ce}]=await Promise.all([
    db.from('blocks').select('id,label,status').eq('school_year_id',year.id),
    db.from('club_offerings').select('id,block_id,club_title,section_label,sponsor_name,meeting_days,capacity_type,max_capacity,grade_limited,eligible_grades,eligible_grade')
  ]);
  if(be)return{ok:false,message:`Could not load sessions: ${be.message}`};
  if(ce)return{ok:false,message:`Could not load clubs: ${ce.message}`};
  const prior=(blocks??[]).filter((b:any)=>b.id!==block.id);
  const ids=new Set(prior.map((b:any)=>b.id));
  const rows=(clubs??[]).filter((c:any)=>ids.has(c.block_id));
  const labels=new Map(prior.map((b:any)=>[b.id,String(b.label??'Prior session')]));
  const counts=new Map<string,number>(); rows.forEach((c:any)=>counts.set(c.block_id,(counts.get(c.block_id)??0)+1));
  return {ok:true,message:prior.length?'Choose clubs to copy.':'There are no other sessions in this school year yet.',blocks:prior.map((b:any)=>({id:b.id,label:String(b.label??'Untitled session'),clubCount:counts.get(b.id)??0})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true})),clubs:rows.map((c:any)=>({id:c.id,blockId:c.block_id,blockLabel:labels.get(c.block_id)??'Prior session',clubTitle:c.club_title,sectionLabel:c.section_label,sponsorName:c.sponsor_name,meetingDays:Array.isArray(c.meeting_days)?c.meeting_days:[],capacityType:c.capacity_type,maxCapacity:c.max_capacity,gradeLimited:Boolean(c.grade_limited),eligibleGrades:Array.isArray(c.eligible_grades)?c.eligible_grades:(c.eligible_grade?[c.eligible_grade]:[])})).sort((a,b)=>name(a.clubTitle,a.sectionLabel).localeCompare(name(b.clubTitle,b.sectionLabel)))};
}

export async function copyClubsForward(input:{sourceBlockId:string;clubIds:string[]}):Promise<CopyResult>{
  const user=await requireRole(['admin']);
  const db=createAdminClient();
  const {year,block}=await getActiveContext();
  if(!year||!block)return{ok:false,message:'No active school year or current session is configured.'};
  const selected=[...new Set(input.clubIds.map(String).filter(Boolean))];
  if(!input.sourceBlockId||input.sourceBlockId===block.id)return{ok:false,message:'Choose a different session to copy from.'};
  if(!selected.length)return{ok:false,message:'Select at least one club to copy.'};
  const {data:link,error:le}=await db.from('google_workspace_links').select('google_student_form_id').eq('school_year_id',year.id).eq('block_id',block.id).maybeSingle();
  if(le)return{ok:false,message:`Could not check the student form: ${le.message}`};
  if(link?.google_student_form_id)return{ok:false,message:'The student form already exists for this session. Copy clubs before creating the form.'};
  const {data:sourceBlock,error:sbe}=await db.from('blocks').select('id,label,school_year_id').eq('id',input.sourceBlockId).eq('school_year_id',year.id).maybeSingle();
  if(sbe||!sourceBlock)return{ok:false,message:`Could not load the source session: ${sbe?.message??'Not found'}`};
  const [{data:source,error:se},{data:existing,error:ee}]=await Promise.all([
    db.from('club_offerings').select('*').eq('block_id',input.sourceBlockId).in('id',selected),
    db.from('club_offerings').select('club_title,section_label').eq('block_id',block.id)
  ]);
  if(se)return{ok:false,message:`Could not load selected clubs: ${se.message}`};
  if(ee)return{ok:false,message:`Could not check existing clubs: ${ee.message}`};
  const keys=new Set((existing??[]).map((c:any)=>key(c.club_title,c.section_label))); const skipped:string[]=[]; const inserts:any[]=[];
  for(const c of source??[]){const k=key(c.club_title,c.section_label);if(keys.has(k)){skipped.push(name(c.club_title,c.section_label));continue;}keys.add(k);inserts.push({block_id:block.id,submitted_by_user_id:user.id,club_title:c.club_title,section_label:c.section_label,description:c.description??'',club_title_es:c.club_title_es??null,section_label_es:c.section_label_es??null,description_es:c.description_es??null,spanish_translation_ready:Boolean(c.spanish_translation_ready),spanish_translation_source_hash:c.spanish_translation_source_hash??null,spanish_translation_source:'copied_forward',spanish_translation_updated_at:c.spanish_translation_updated_at??null,sponsor_name:c.sponsor_name??'',leader_email:c.leader_email??null,meeting_days:Array.isArray(c.meeting_days)?c.meeting_days:[],capacity_type:c.capacity_type??'limited',max_capacity:c.max_capacity??null,minimum_viable_enrollment:c.minimum_viable_enrollment??null,minimum_applies_to:c.minimum_applies_to??'section',grade_limited:Boolean(c.grade_limited),eligible_grades:Array.isArray(c.eligible_grades)?c.eligible_grades:(c.eligible_grade?[c.eligible_grade]:null),eligible_grade:c.eligible_grade??null,matching_preference:c.matching_preference??'highest_interest',admin_notes:c.admin_notes?`${c.admin_notes}\nCopied from ${sourceBlock.label}.`:`Copied from ${sourceBlock.label}.`,is_active:c.is_active!==false,show_to_students:false});}
  if(!inserts.length)return{ok:true,copiedCount:0,skippedNames:skipped,message:'No clubs were copied because all selected clubs already exist in this session.'};
  const {data:created,error:ie}=await db.from('club_offerings').insert(inserts).select('id');
  if(ie)return{ok:false,message:`Could not copy clubs: ${ie.message}`};
  for(const row of created??[])await validateClubOffering(block.id,row.id);
  refresh(); const count=created?.length??0;
  return{ok:true,copiedCount:count,skippedNames:skipped,message:`Copied ${count} club${count===1?'':'s'} from ${sourceBlock.label}. Copied clubs are hidden from students until reviewed.${skipped.length?` Skipped ${skipped.length} duplicate${skipped.length===1?'':'s'}.`:''}`};
}

