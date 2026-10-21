import { buildAssets } from './core.mjs';

export async function generateContent(input) {
  const provider = process.env.AI_PROVIDER || 'demo';
  if (provider !== 'openai-compatible') return {assets:buildAssets(input),provider:'demo',model:null,estimatedCost:0,actualUsage:null};
  const key = process.env.AI_API_KEY;
  if (!key || key === 'replace_me') throw new Error('AI_PROVIDER is set to openai-compatible but AI_API_KEY is missing. Use demo mode or configure a key.');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'');
  const inputAssets = buildAssets(input);
  const prompt = `Return only JSON: {"assets":[{"id":"...","hook":"...","caption":"...","cta":"..."}]}. For every supplied draft, rewrite a distinct, useful, accurate platform-native caption based only on the source. Do not add unverified product claims, customer names, testimonials, statistics, or facts. Preserve IDs. Keep scripts and slides from their supplied draft unchanged.\nSOURCE:\n${input.source}\nDRAFTS:\n${JSON.stringify(inputAssets.map(a=>({id:a.id,platform:a.platform,format:a.contentType,hook:a.hook,caption:a.caption,cta:a.cta})))}`;
  const retryLimit=Math.max(0,Math.min(3,Number(process.env.AI_RETRIES)||2));
  let payload,retries=0,lastError;
  for(let attempt=0;attempt<=retryLimit;attempt++){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(1000,Number(process.env.AI_TIMEOUT_MS)||30000));
    try{
      const response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model,temperature:0.55,response_format:{type:'json_object'},messages:[{role:'system',content:'You write careful creator education content. Return valid JSON only.'},{role:'user',content:prompt}]}),signal:controller.signal});
      if(!response.ok){
        const retryable=response.status===429||response.status>=500;
        if(retryable&&attempt<retryLimit){const retryAfter=Number(response.headers.get('retry-after'))||0;await new Promise(resolve=>setTimeout(resolve,Math.min(3000,retryAfter*1000||250*2**attempt)));retries++;continue;}
        throw new Error(response.status===429?'The AI provider rate limited this run after retries.':`AI provider returned HTTP ${response.status}.`);
      }
      payload=await response.json();break;
    }catch(e){
      lastError=e;
      if(attempt<retryLimit&&(e.name==='AbortError'||e.name==='TypeError')){retries++;await new Promise(resolve=>setTimeout(resolve,250*2**attempt));continue;}
      if(e.name==='AbortError')throw new Error('AI provider timed out after retries.');
      throw e;
    }finally{clearTimeout(timeout);}
  }
  if(!payload)throw lastError||new Error('AI provider request failed.');
  let result;
  try {result=JSON.parse(payload.choices?.[0]?.message?.content||'');} catch {throw new Error('AI provider returned invalid JSON. No assets were saved; retry in demo mode or try again.');}
  if(!Array.isArray(result.assets))throw new Error('AI response did not include an assets array. No assets were saved.');
  const byId=new Map(result.assets.map(x=>[x.id,x]));
  const assets=inputAssets.map(a=>{const generated=byId.get(a.id);if(generated){if(typeof generated.hook==='string')a.hook=generated.hook;if(typeof generated.caption==='string')a.caption=generated.caption;if(typeof generated.cta==='string')a.cta=generated.cta;}return a;});
  const usage=payload.usage||null;
  // No provider-independent price is assumed. Mark estimate unavailable unless caller adds their pricing.
  return {assets,provider:'openai-compatible',model,estimatedCost:null,actualUsage:usage,retries};
}
