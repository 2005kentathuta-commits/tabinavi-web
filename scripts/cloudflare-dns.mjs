#!/usr/bin/env node

/**
 * Cloudflare DNS helper for Vercel apex + www A records.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... node scripts/cloudflare-dns.mjs --domain tabinoshiori.com
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... node scripts/cloudflare-dns.mjs --domain tabinoshiori.com --ip 76.76.21.21
 */

const CLOUDFLARE_API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const CLOUDFLARE_ZONE_ID_ENV = String(process.env.CLOUDFLARE_ZONE_ID || '').trim();
const DEFAULT_VERCEL_IP = '76.76.21.21';

function parseArgs(argv) {
  const args = {
    domain: '',
    ip: DEFAULT_VERCEL_IP,
    ttl: 3600,
    zoneId: CLOUDFLARE_ZONE_ID_ENV,
    proxied: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const entry = argv[i];
    if (entry === '--domain') {
      args.domain = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
      continue;
    }
    if (entry === '--ip') {
      args.ip = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (entry === '--ttl') {
      args.ttl = Math.max(60, Number(argv[i + 1]) || 3600);
      i += 1;
      continue;
    }
    if (entry === '--zone-id') {
      args.zoneId = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (entry === '--proxied') {
      args.proxied = true;
      continue;
    }
    if (entry === '--dns-only') {
      args.proxied = false;
      continue;
    }
  }

  return args;
}

async function cfRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload?.errors) ? payload.errors.map((e) => e.message).join(', ') : '';
    throw new Error(`Cloudflare API error (${response.status}): ${errors || 'unknown error'}`);
  }

  return payload;
}

async function resolveZoneId(domain) {
  if (CLOUDFLARE_ZONE_ID_ENV) {
    return CLOUDFLARE_ZONE_ID_ENV;
  }
  const payload = await cfRequest(`/zones?name=${encodeURIComponent(domain)}&status=active`);
  const zone = payload?.result?.[0];
  if (!zone?.id) {
    throw new Error(`Zone not found for domain: ${domain}`);
  }
  return zone.id;
}

async function upsertARecord(zoneId, fullName, content, ttl, proxied) {
  const list = await cfRequest(
    `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(fullName)}&per_page=100`,
  );
  const existing = Array.isArray(list?.result) ? list.result : [];

  if (existing.length > 0) {
    const primary = existing[0];
    const needsUpdate =
      String(primary.content || '') !== String(content) ||
      Number(primary.ttl || 0) !== Number(ttl) ||
      Boolean(primary.proxied) !== Boolean(proxied);

    if (needsUpdate) {
      await cfRequest(`/zones/${zoneId}/dns_records/${primary.id}`, {
        method: 'PUT',
        body: {
          type: 'A',
          name: fullName,
          content,
          ttl,
          proxied,
        },
      });
      console.log(`updated A ${fullName} -> ${content}`);
    } else {
      console.log(`ok A ${fullName} already ${content}`);
    }

    if (existing.length > 1) {
      for (let i = 1; i < existing.length; i += 1) {
        await cfRequest(`/zones/${zoneId}/dns_records/${existing[i].id}`, { method: 'DELETE' });
        console.log(`deleted duplicate A ${fullName} (${existing[i].id})`);
      }
    }

    return;
  }

  await cfRequest(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: {
      type: 'A',
      name: fullName,
      content,
      ttl,
      proxied,
    },
  });
  console.log(`created A ${fullName} -> ${content}`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN is required');
  }
  if (!args.domain) {
    throw new Error('Usage: node scripts/cloudflare-dns.mjs --domain yourdomain.com [--ip 76.76.21.21]');
  }

  const zoneId = args.zoneId || (await resolveZoneId(args.domain));
  const rootName = args.domain;
  const wwwName = `www.${args.domain}`;

  await upsertARecord(zoneId, rootName, args.ip, args.ttl, args.proxied);
  await upsertARecord(zoneId, wwwName, args.ip, args.ttl, args.proxied);

  console.log('\nDone. Validate in Vercel Domains -> Refresh.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
