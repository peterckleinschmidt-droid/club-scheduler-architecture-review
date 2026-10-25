'use client';

import { createElement, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoogleFormForCurrentBlock } from './actions';

type Result={ok:boolean;message:string;editUrl?:string;responderUrl?:string};
function Link({href,label,primary=false}:{href:string;label:string;primary?:boolean}){return createElement('a',{href,target:'_blank',rel:'noreferrer',className:primary?'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white':'inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-medium'},label);}
export default function CreateGoogleFormClient(){
 const router=useRouter();const [pending,start]=useTransition();const [result,setResult]=useState<Result|null>(null);
 if(result?.ok)return <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="font-semibold">Student form ready</div><p className="mt-1 text-sm">{result.message}</p><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>Open the form and review the student wording.</li><li>Return to the session workbook, open Google Workflow, and choose <strong>Find student form</strong>.</li><li>Then choose <strong>Connect student form</strong> so new responses can be prepared for matching.</li><li>Share the student link when you are ready.</li></ol><div className="mt-4 flex flex-wrap gap-2">{result.editUrl?<Link href={result.editUrl} label="Review form" primary/>:null}{result.responderUrl?<Link href={result.responderUrl} label="Open student form"/>:null}<button type="button" onClick={()=>router.push('/admin/workflow')} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Return to Workflow</button></div></div>;
 return <div className="w-full"><button type="button" disabled={pending} onClick={()=>{setResult(null);start(async()=>setResult(await createGoogleFormForCurrentBlock()));}} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending?'Creating student form...':'Create student form'}</button>{result?<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{result.message}</div>:null}</div>;
}
