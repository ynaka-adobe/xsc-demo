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
 * Auth (env or .env in the cwd): DM_CLIENT_ID + DM_CLIENT_SECRET + DM_SCOPES for the
 * OAuth Server-to-Server tech account (AEM admin), or a ready IMS_ADMIN_TOKEN.
 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';

const DELIVERY = 'https://delivery-p154856-e1944736.adobeaemcloud.com';
const TOKEN_URL = `${DELIVERY}/adobe/assets/token`;
const IMS_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_ASSETS = [
  'urn:aaid:aem:564d5f1f-3625-4f46-82c0-b01e6b145953', // partners/headless-is-here.png
  'urn:aaid:aem:65897052-aa89-4ed8-9573-83cbf18467ec', // public-assets/centene_logo_2023.jpg
];

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

// OAuth Server-to-Server: tech account (AEM admin) -> IMS access token
async function getImsToken() {
  const { DM_CLIENT_ID: id, DM_CLIENT_SECRET: secret, DM_SCOPES: scope } = process.env;
  if (id && secret) {
    const res = await fetch(IMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: id, client_secret: secret, scope,
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`IMS ${res.status}: ${JSON.stringify(j)}`);
    return j.access_token;
  }
  return process.env.IMS_ADMIN_TOKEN?.replace(/^Bearer\s+/i, '').replace(/\\_/g, '_');
}

async function mintToken(imsToken, {
  id, username, groups, valid, attributes = {},
}) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${imsToken}`,
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
  const url = `${DELIVERY}/adobe/assets/${assetId}/as/preview.webp?width=200${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
  const ims = await getImsToken();
  if (!ims) {
    console.error('Set DM_CLIENT_ID, DM_CLIENT_SECRET, DM_SCOPES (tech account) or IMS_ADMIN_TOKEN.');
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Minting token for groups=[${opts.groups.join(', ')}] validFor=${opts.valid}s`);
  const resp = await mintToken(ims, {
    ...opts, attributes: { department: 'Engineering', countryCode: 'US' },
  });
  const raw = resp.token ?? resp.accessToken ?? resp.value;
  const token = raw && !raw.startsWith('sd:') ? `sd:${raw}` : raw;
  console.log(`Token expires: ${resp.expiryTime ?? 'n/a'}`);
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
