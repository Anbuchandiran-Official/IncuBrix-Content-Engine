import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAssets,csvEscape,makeUtm,normalizedHash,similarity,splitIdeas,validateStatusChange} from '../app/core.mjs';
import {generateContent} from '../app/provider.mjs';

const source=`A creator can make one long source easier to reuse by identifying the useful ideas first. Each idea should answer one clear audience question and include enough context to make sense on its own.\n\nA short video can demonstrate one step while a carousel can explain the sequence. A text post can explore why the creator chose that approach. Keep the original meaning intact when changing the format.\n\nReview names and numbers against the source before publishing. Use licensed or original media, add accurate captions, and get permission before using another person's words or voice. Track one action with a tagged destination and review actual results after publishing.`;

test('source splitting and normalized exact hashes are stable',()=>{
 assert.ok(splitIdeas(source).length>=4);
 assert.equal(normalizedHash('A useful idea!'),normalizedHash(' a useful idea '));
 assert.ok(similarity('creator content workflow', 'creator content workflow')>.99);
 assert.ok(similarity('creator content workflow', 'creator workflow for useful content')>.2);
});

test('demo engine produces 10 unique platform-specific drafts with source evidence',()=>{
 const assets=buildAssets({source,sourceId:'source-test',platforms:['LinkedIn','Instagram','YouTube Shorts'],brand:{},config:{count:3}});
 assert.equal(assets.length,10);
 assert.equal(new Set(assets.map(x=>x.id)).size,10);
 assert.deepEqual(new Set(assets.map(x=>x.platform)),new Set(['LinkedIn','Instagram','YouTube Shorts']));
 assert.ok(assets.every(x=>x.sourceId==='source-test'&&x.sourceEvidence&&x.validation));
 assert.ok(assets.filter(x=>x.videoScript).every(x=>x.videoDuration<=60));
 assert.ok(assets.every(x=>x.status==='draft'));
});

test('source facts are not fabricated and mandatory transition checks block approval',()=>{
 const assets=buildAssets({source,sourceId:'source-test',platforms:['LinkedIn'],brand:{verifiedFacts:[]},config:{}});
 const asset={...assets[0],status:'in_review'};
 assert.equal(asset.validation.passed,false,'placeholder destination and incomplete rights must block readiness');
 assert.throws(()=>validateStatusChange(asset,'approved'),/Resolve validation errors/);
 assert.throws(()=>buildAssets({source:'too short',sourceId:'s'}),/at least 100 characters/);
});

test('UTM preserves destination query values and CSV quotes safely',()=>{
 const url=new URL(makeUtm('https://example.org/page?ref=a','YouTube Shorts','launch campaign','AS-1'));
 assert.equal(url.searchParams.get('ref'),'a');
 assert.equal(url.searchParams.get('utm_source'),'youtube_shorts');
 assert.equal(url.searchParams.get('utm_content'),'AS-1');
 assert.equal(csvEscape('say "hello",\nagain'), '"say ""hello"",\nagain"');
});

test('near-duplicate candidates are flagged rather than discarded',()=>{
 const asset={hook:'One useful creator workflow idea',caption:'A creator can make one source easier to reuse with a clear workflow.'};
 const assets=buildAssets({source,sourceId:'s',platforms:['LinkedIn'],existing:[asset],brand:{},config:{}});
 assert.ok(assets.some(a=>a.duplicate.near));
 assert.ok(assets.some(a=>a.validation.warnings.some(w=>w.code==='near_duplicate')));
});

test('provider configuration fails clearly when API credentials are absent',async()=>{
 const previous={provider:process.env.AI_PROVIDER,key:process.env.AI_API_KEY};
 process.env.AI_PROVIDER='openai-compatible';delete process.env.AI_API_KEY;
 try{await assert.rejects(()=>generateContent({source,sourceId:'s',platforms:['LinkedIn']}),/AI_API_KEY is missing/);}
 finally{if(previous.provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=previous.provider;if(previous.key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=previous.key;}
});
