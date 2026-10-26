import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { CandidateProfileSchema } from "../src/domain/candidate-profile.js";
import { buildDashboardData } from "../src/dashboard/view-model.js";
import { buildApplicationBrief } from "../src/dashboard/application-brief.js";
import { ApplicantContact, buildLocalDraft } from "../src/dashboard/local-draft.js";
import { main } from "../scripts/compare-jobs.js";

let running = false;
let startedAt: string | null = null;
let finishedAt: string | null = null;
let failure: string | null = null;
const required = ["DATABASE_URL","CANDIDATE_PROFILE","APPLICANT_CONTACT",
  "SITE_URL","SITE_IMPORT_KEY","SITE_BYPASS_TOKEN"];
function authorized(req:IncomingMessage) {
  const expected=process.env.REFRESH_KEY;
  const actual=req.headers["x-refresh-key"];
  if (!expected || typeof actual !== "string") return false;
  const a=Buffer.from(expected), b=Buffer.from(actual);
  return a.length===b.length && timingSafeEqual(a,b);
}
function json(res:ServerResponse,code:number,value:unknown) {
  res.statusCode=code;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(value));
}
async function post(kind:string, payload:Record<string,unknown>) {
  const result=await fetch(new URL("/api/import",process.env.SITE_URL!),{
    method:"POST",headers:{"Content-Type":"application/json",
      "x-import-key":process.env.SITE_IMPORT_KEY!,
      "OAI-Sites-Authorization":`Bearer ${process.env.SITE_BYPASS_TOKEN!}`},
    body:JSON.stringify({kind,...payload}),
  });
  if (!result.ok) throw Error(`Cloud import ${kind} failed (${result.status})`);
}
async function sendRows(kind:string,rows:unknown[],step:number) {
  for(let i=0;i<rows.length;i+=step)await post(kind,{rows:rows.slice(i,i+step)});
}
async function refresh() {
  for(const name of required)if(!process.env[name])throw Error(`Missing ${name}`);
  process.env.CLOUD_MODE="1";
  const report=await main();
  if(!report)throw Error("Comparison report unavailable");
  const profile=CandidateProfileSchema.parse(JSON.parse(process.env.CANDIDATE_PROFILE!));
  const contact=ApplicantContact.parse(JSON.parse(process.env.APPLICANT_CONTACT!));
  const data=buildDashboardData(report,[]);
  const syncId=report.generatedAt;
  const jobRows=report.rows.map((r)=>({id:r.id,url:r.canonicalUrl,title:r.title,
    company:r.company,location:r.location??"",workplaceType:r.workplaceType,
    site:new URL(r.canonicalUrl).hostname,tier:r.priority.tier,queue:r.screening.status,
    firstSeenAt:r.firstSeenAt??null,lastSeenAt:r.lastSeenAt??null,
    sourceUrl:r.descriptionReview?.sourceUrl??r.sourceCheck?.sourceUrl??null,syncId}));
  await sendRows("jobs",jobRows,40);
  await sendRows("dashboardRows",data.rows.map((r)=>({id:r.id,url:r.url,
    data:JSON.stringify(r),syncId})),40);
  const templates=[];
  for(const row of report.rows){
    try{
      const brief=buildApplicationBrief({...report,rows:[row]},profile,row.id,syncId).brief;
      const draft=buildLocalDraft(brief,contact,syncId);
      templates.push({jobId:row.id,data:JSON.stringify(draft),syncId});
    }catch{ /* One incomplete vacancy cannot stop the full snapshot. */ }
  }
  await sendRows("draftTemplates",templates,10);
  await post("finishJobs",{syncId});
  await post("finishDraftTemplates",{syncId});
  await post("finishDashboard",{syncId,meta:JSON.stringify({generatedAt:data.generatedAt,
    discovery:data.discovery,counts:data.counts,drafts:data.drafts})});
  return {jobs:jobRows.length,templates:templates.length};
}
export default async function handler(req:IncomingMessage,res:ServerResponse) {
  if(!authorized(req))return json(res,403,{error:"Forbidden"});
  if(req.method==="GET")return json(res,200,{status:running?"running":failure?"failed":"idle",
    startedAt,finishedAt,error:failure});
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
  if(running)return json(res,202,{status:"running",startedAt});
  running=true;startedAt=new Date().toISOString();finishedAt=null;failure=null;
  waitUntil(refresh().then((result)=>{
    console.log("Cloud refresh completed",result);
    running=false;finishedAt=new Date().toISOString();
  }).catch((error)=>{
    failure=error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[database]"):"Unknown failure";
    console.error("Cloud refresh failed",failure);
    running=false;finishedAt=new Date().toISOString();
  }));
  return json(res,202,{status:"running",startedAt});
}
