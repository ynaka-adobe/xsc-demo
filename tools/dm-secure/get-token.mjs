#!/usr/bin/env node
/*
 * Dynamic Media secure delivery: mint a token for a set of subject attributes,
 * then call the delivery API with ?token= to check which assets are visible.
 *
 * Usage:
 *   IMS_ADMIN_TOKEN=... node tools/dm-secure/get-token.mjs \
 *     [--groups partners,dealers] [--user 123:dummy] [--valid 3600] \
 *     [--asset urn:aaid:aem:...]...
 *
 * IMS_ADMIN_TOKEN is read from the environment or a .env file in the cwd.
 * In production this is a technical account that is an AEM admin.
 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';

const TOKEN_URL = 'https://polaris-poc-polaris-new-deploy-ethos09-prod-va7-k-e42c23.cloud.adobe.io/adobe/assets/token';
const DELIVERY = 'https://delivery-p154856-e1944736.adobeaemcloud.com';
const STORAGE_CONTAINER = 'sa0154856019447360f400aa';
const ROUTING = [
  'namespace=ns-team-aem-cm-prd-n176867',
  'cluster=ethos58-prod-va7',
  'aemhost=assets.adobeaemcloud.com',
  'bucketType=aemcs',
  'region=va',
  'bucket=delivery-p154856-e1944736',
  'bucketId=p154856-e1944736',
  'tier=delivery',
  `storageContainer=${STORAGE_CONTAINER}`,
  'tenant=cm-p154856-e1944736',
  'program=154856',
  'environment=1944736',
  'environmentType=prod',
  'imsOrg="21BD487E5F2280130A495ECC@AdobeOrg"',
  'hipaa=0',
].join(',');
const DEFAULT_ASSETS = ['urn:aaid:aem:9b41cdc6-8555-4352-8a79-00f752547e5a'];

function loadEnv() {
  try {
    readFileSync('.env', 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch { /* no .env */ }
}

function parseArgs(argv) {
  const opts = {
    groups: ['partners'], id: '123', username: 'dummy', valid: 3600, assets: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === '--groups') { opts.groups = v ? v.split(',').filter(Boolean) : []; i += 1; }
    if (k === '--user') { [opts.id, opts.username] = v.split(':'); i += 1; }
    if (k === '--valid') { opts.valid = Number(v); i += 1; }
    if (k === '--asset') { opts.assets.push(v); i += 1; }
  }
  if (!opts.assets.length) opts.assets = DEFAULT_ASSETS;
  return opts;
}

async function mintToken(imsToken, {
  id, username, groups, valid, attributes = {},
}) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${imsToken}`,
      'x-sky-dm-storage-container': STORAGE_CONTAINER,
      'x-request-id': `xsc-demo-${Date.now()}`,
      'x-adobe-routing': ROUTING,
    },
    body: JSON.stringify({
      subjectAttributes: {
        id, username, groups, additionalAttributes: attributes,
      },
      validFor: valid,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { token: text.trim() }; }
}

async function check(assetId, token) {
  const url = `${DELIVERY}/adobe/assets/${assetId}/metadata${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url);
  const body = await res.text();
  let title = '';
  try {
    const j = JSON.parse(body);
    title = j?.assetMetadata?.['dc:title'] || j?.repositoryMetadata?.['repo:name'] || '';
  } catch { /* not JSON */ }
  return { status: res.status, title, url };
}

async function main() {
  loadEnv();
  const ims = process.env.IMS_ADMIN_TOKEN?.replace(/^Bearer\s+/i, '').replace(/\\_/g, '_');
  if (!ims) {
    console.error('Set IMS_ADMIN_TOKEN (env or .env) to an AEM admin IMS access token.');
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Minting token for groups=[${opts.groups.join(', ')}] validFor=${opts.valid}s`);
  const resp = await mintToken(ims, {
    ...opts, attributes: { department: 'Engineering', countryCode: 'US' },
  });
  const token = resp.token ?? resp.accessToken ?? resp.value;
  console.log('Token response keys:', Object.keys(resp).join(', '));
  if (!token) { console.log(JSON.stringify(resp, null, 2)); process.exit(1); }

  const results = await Promise.all(opts.assets.map(async (asset) => ({
    asset, anon: await check(asset), signed: await check(asset, token),
  })));
  results.forEach(({ asset, anon, signed }) => {
    console.log(`\n${asset}`);
    console.log(`  no token   -> ${anon.status}`);
    console.log(`  with token -> ${signed.status} ${signed.title}`);
    console.log(`  ${signed.url}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
