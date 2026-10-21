import { createHash, randomUUID } from 'node:crypto';

export const ALLOWED_PLATFORMS = ['LinkedIn', 'Instagram', 'YouTube Shorts'];
export const STATUS_TRANSITIONS = {
  draft: ['in_review'], in_review: ['draft', 'approved'], approved: ['in_review', 'scheduled'],
  scheduled: ['approved', 'published'], published: [],
};
const IDEAS = [
  ['LinkedIn','Text post','One practical lesson'], ['Instagram','Carousel','A step-by-step explainer'],
  ['YouTube Shorts','Short video','A quick visual demonstration'], ['LinkedIn','Document carousel','A useful checklist'],
  ['Instagram','Reel','A 30-second how-to'], ['YouTube Shorts','Short video','A common mistake and its fix'],
  ['LinkedIn','Question post','A reflection prompt'], ['Instagram','Graphic','A saveable summary'],
  ['YouTube Shorts','Short video','One idea explained simply'], ['LinkedIn','Text post','A second perspective'],
];
const stopwords = new Set('about after again also and are because before between both could every from have into more most other should some than that their them then there these they this through when where which while with your'.split(' '));

export function normalizedHash(text) {
  return createHash('sha256').update(String(text).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')).digest('hex');
}
export function similarity(a, b) {
  const tokens = x => new Set(String(x).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(t => !stopwords.has(t)) ?? []);
  const aa = tokens(a), bb = tokens(b); if (!aa.size || !bb.size) return 0;
  let common = 0; for (const t of aa) if (bb.has(t)) common++;
  return common / (aa.size + bb.size - common);
}
export function makeUtm(destination, platform, campaign, assetId) {
  const url = new URL(destination);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Destination must use http or https.');
  url.searchParams.set('utm_source', platform.toLowerCase().replace(/\s+/g, '_'));
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', assetId);
  return url.toString();
}
export function splitIdeas(text) {
  const clean = text.replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)/g,' ').replace(/^\s{0,3}#{1,6}\s*/gm,'');
  return [...new Set(clean.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/\s+/g,' ').trim()).filter(s => s.length >= 35))];
}
function validateAsset(a, brand, destination) {
  const errors = [], warnings = [];
  for (const key of ['hook','caption','cta','hashtags','sourceEvidence']) if (!String(a[key] ?? '').trim()) errors.push({code:`missing_${key}`,message:`Add ${key} before moving this asset to review.`});
  if (a.hashtags && !/(^|\s)#[\p{L}\p{N}_]+/u.test(a.hashtags)) errors.push({code:'invalid_hashtags',message:'Include at least one valid hashtag.'});
  try {const u=new URL(a.trackingUrl);if(!['http:','https:'].includes(u.protocol)||!['utm_source','utm_medium','utm_campaign','utm_content'].every(k=>u.searchParams.has(k)))errors.push({code:'invalid_utm',message:'Tracking URL needs http(s) plus utm_source, utm_medium, utm_campaign, and utm_content.'});else if(u.searchParams.get('utm_content')!==a.id)errors.push({code:'utm_asset_mismatch',message:'utm_content must match this asset ID.'});}
  catch {errors.push({code:'invalid_utm',message:'Add a valid UTM-tagged http(s) tracking URL.'});}
  if (!a.rights?.mediaReviewed || !a.rights?.likenessConsent || !a.rights?.musicLicensed) warnings.push({code:'rights_review',message:'Complete the rights checklist before approval.'});
  if (a.rights?.aiDisclosureRequired && !a.rights?.aiDisclosureAdded) warnings.push({code:'ai_disclosure',message:'Add the disclosure required by the relevant platform before approval.'});
  const incuClaims = `${a.hook} ${a.caption}`.match(/[^.!?\n]*\b(IncuBrix|Incu Brix)\b[^.!?\n]*/gi) ?? [];
  const facts=(brand.verifiedFacts||[]).map(x=>typeof x==='string'?x:x.fact).filter(Boolean);
  if (incuClaims.some(claim=>!facts.some(fact=>similarity(claim,fact)>=0.25))) errors.push({code:'unsupported_product_claim',message:'An IncuBrix statement has no matching verified fact. Add evidence or remove the claim.'});
  const maxLength=a.platform==='Instagram'?2200:a.platform==='LinkedIn'?3000:5000;
  if((a.caption||'').length>maxLength)errors.push({code:'platform_length',message:`Caption exceeds the ${maxLength}-character platform guidance.`});
  if (a.platform === 'YouTube Shorts' && a.contentType.toLowerCase().includes('video') && (!a.videoDuration || a.videoDuration > 60)) errors.push({code:'video_duration',message:'Short-video duration must be between 1 and 60 seconds.'});
  if (a.contentType.toLowerCase().includes('carousel') && (a.slides?.length ?? 0) < 3) errors.push({code:'carousel_slides',message:'A carousel needs at least three editable slides.'});
  if (destination.includes('example.com')) warnings.push({code:'placeholder_url',message:'Replace the placeholder destination before publishing.'});
  return {passed: errors.length === 0 && warnings.length === 0, errors, warnings};
}
export function validateStatusChange(asset, next) {
  if (!(STATUS_TRANSITIONS[asset.status] ?? []).includes(next)) throw new Error(`Cannot move ${asset.status} to ${next}.`);
  if (['approved','scheduled','published'].includes(next) && (!asset.validation?.passed || !asset.rights?.mediaReviewed || !asset.rights?.likenessConsent || !asset.rights?.musicLicensed)) {
    throw new Error('Resolve validation errors and complete every rights check before approval.');
  }
}

export function buildAssets({source, sourceId, platforms = ALLOWED_PLATFORMS, brand = {}, config = {}, existing = []}) {
  if (!source || source.trim().length < 100) throw new Error('Source needs at least 100 characters to generate useful content.');
  const ideas = splitIdeas(source); if (!ideas.length) throw new Error('Could not find complete ideas. Add a longer article or transcript.');
  const chosen = [...new Set(platforms)].filter(p => ALLOWED_PLATFORMS.includes(p));
  if (!chosen.length) throw new Error('Select at least one supported platform.');
  const wanted = Math.max(10, Math.min(Number(config.count) || 10, 60));
  const assets = [];
  const existingTexts = existing.map(a => `${a.hook} ${a.caption}`);
  const existingHashes = new Set(existingTexts.map(normalizedHash));
  for (let i=0; i<wanted; i++) {
    const [basePlatform, baseType, angle] = IDEAS[i % IDEAS.length];
    const platform = chosen[i % chosen.length];
    const idea = ideas[(i + Math.floor(i / ideas.length)) % ideas.length];
    const id = `AS-${randomUUID().replaceAll('-','').slice(0,10).toUpperCase()}`;
    const hook = idea.length > 95 ? `${idea.slice(0,92).trimEnd()}…` : idea;
    const isVideo = (platform === 'YouTube Shorts' && i % 3 === 0) || (platform === 'Instagram' && i % 5 === 0);
    const isCarousel = !isVideo && (baseType.toLowerCase().includes('carousel') || i % 4 === 1);
    const contentType = isVideo ? (platform === 'Instagram' ? 'Reel script' : 'Short video script') : isCarousel ? 'Carousel' : platform === 'Instagram' ? 'Graphic' : baseType;
    const title = `${angle}: ${idea.slice(0,55)}`;
    const cta = config.cta || 'Save this idea and try it with one piece of your own content.';
    const caption = `${angle}. ${idea}\n\n${brand.voice || 'Keep the explanation clear and useful. Preserve the source meaning and verify details before publishing.'}`;
    const asset = {
      id, title, sourceId, sourceEvidence: idea, platform, contentType, pillar: config.pillars?.[i % (config.pillars.length || 1)] || 'Creator education',
      audience: config.audience || brand.audience || 'Creators and small content teams', hook, caption,
      hashtags: '#CreatorEducation #ContentStrategy #CreatorWorkflow', cta,
      trackingUrl: makeUtm(config.destination || 'https://example.com/replace-before-publishing', platform, config.campaign || 'ib27_assessment', id),
      targetMetric: 'Outbound clicks', targetValue: null, targetLabel: 'Proposed metric; set target after account baseline',
      videoScript: isVideo ? {durationSeconds:30, scenes:[{seconds:'0-2',shot:'Open on a clear on-screen hook.',narration:hook,text:hook},{seconds:'2-22',shot:'Show one example using original or licensed material.',narration:idea,text:idea.slice(0,110)},{seconds:'22-30',shot:'Close on a useful next step.',narration:cta,text:cta}]} : null,
      videoDuration: isVideo ? 30 : null,
      slides: isCarousel ? [{text:hook,role:'Hook'},{text:idea,role:'Useful point'},{text:'Apply the idea to one source you already have.',role:'Example'},{text:cta,role:'CTA'}] : [],
      visualDirection: isVideo ? 'Vertical 9:16, original screen demo or simple typography, accurate captions.' : isCarousel ? 'Four clean, high-contrast text slides; original typography and shapes.' : 'One original, high-contrast visual with a readable headline.',
      aspectRatio: isVideo ? '9:16' : isCarousel ? '4:5' : '1:1',
      editableSource: {hook,caption,slides:isCarousel ? [{text:hook},{text:idea},{text:cta}] : [],script:isVideo ? idea : null},
      rights: {mediaReviewed:false,likenessConsent:false,musicLicensed:false,aiDisclosureRequired:false,aiDisclosureAdded:false},
      status:'draft', scheduledAt:null, createdAt:new Date().toISOString(), provider:process.env.AI_PROVIDER || 'demo',
    };
    const assetText=`${asset.hook} ${asset.caption}`,exact=existingHashes.has(normalizedHash(assetText))||assets.some(a=>normalizedHash(`${a.hook} ${a.caption}`)===normalizedHash(assetText));
    const near = exact || existingTexts.some(t => similarity(assetText, t) >= 0.82) || assets.some(a => similarity(assetText, `${a.hook} ${a.caption}`) >= 0.82);
    asset.duplicate = {exact,near,similarityThreshold:0.82,decision:exact?'exact duplicate flagged for manual review':near?'near duplicate flagged for manual review':'unique'};
    asset.validation = validateAsset(asset,brand,config.destination || 'https://example.com/replace-before-publishing');
    if (exact) asset.validation.warnings.push({code:'exact_duplicate',message:'The same normalized copy already exists. Review this draft before using it.'});
    else if (near) asset.validation.warnings.push({code:'near_duplicate',message:'Similar content exists. Review this draft before using it.'});
    assets.push(asset);
  }
  return assets;
}

export function validateEditedAsset(asset, brand = {}, destination = '') {
  const next = {...asset};
  next.validation = validateAsset(next, brand, destination || new URL(next.trackingUrl).origin);
  return next;
}

export function csvEscape(value) {
  const s = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}
