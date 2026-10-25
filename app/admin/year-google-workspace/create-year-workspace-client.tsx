'use client';

import { createElement, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoogleYearWorkspaceForActiveYear } from './actions';

type Result = { ok:boolean; message:string; workbookUrl?:string; folderUrl?:string };
function Link({href,label,primary=false}:{href:string;label:string;primary?:boolean}){return createElement('a',{href,target:'_blank',rel:'noreferrer',className:primary?'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white':'inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-medium'},label);}
export default function CreateYearWorkspaceClient(){
 const router=useRouter();const [pending,start]=useTransition();const [result,setResult]=useState<Result|null>(null);
 if(result?.ok)return <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="font-semibold">Year workspace ready</div><p className="mt-1 text-sm">{result.message}</p><p className="mt-2 text-sm">Add or review homerooms in the year workbook, then continue.</p><div className="mt-4 flex flex-wrap gap-2">{result.workbookUrl?<Link href={result.workbookUrl} label="Open year workbook" primary/>:null}{result.folderUrl?<Link href={result.folderUrl} label="Open year folder"/>:null}<button type="button" onClick={()=>router.refresh()} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Continue</button></div></div>;
 return <div className="w-full"><button type="button" disabled={pending} onClick={()=>{setResult(null);start(async()=>setResult(await createGoogleYearWorkspaceForActiveYear()));}} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending?'Preparing year workspace...':'Prepare year workspace'}</button>{result?<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{result.message}</div>:null}</div>;
}
