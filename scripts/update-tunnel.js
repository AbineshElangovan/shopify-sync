

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const TOML_PATH = path.join(ROOT, 'shopify.app.toml');

const newUrl = process.argv[2];

if (!newUrl) {
  console.error('❌ Usage: node scripts/update-tunnel.js https://YOUR-NEW-TUNNEL.trycloudflare.com');
  process.exit(1);
}

if (!newUrl.startsWith('https://')) {
  console.error('❌ URL must start with https://');
  process.exit(1);
}

const trimmedUrl = newUrl.trim().replace(/\/$/, ''); // remove trailing slash

// ── Update .env ──────────────────────────────────────────────────────────────
let envContent = fs.readFileSync(ENV_PATH, 'utf8');
const oldEnvUrl = envContent.match(/SHOPIFY_APP_URL="([^"]+)"/)?.[1];

envContent = envContent.replace(
  /SHOPIFY_APP_URL="[^"]*"/,
  `SHOPIFY_APP_URL="${trimmedUrl}"`
);
fs.writeFileSync(ENV_PATH, envContent, 'utf8');
console.log(`✅ .env updated`);
console.log(`   OLD: ${oldEnvUrl}`);
console.log(`   NEW: ${trimmedUrl}`);

// ── Update shopify.app*.toml ──────────────────────────────────────────────────
const files = fs.readdirSync(ROOT);
files.forEach(file => {
  if (file.startsWith('shopify.app') && file.endsWith('.toml')) {
    const tomlPath = path.join(ROOT, file);
    let tomlContent = fs.readFileSync(tomlPath, 'utf8');
    const oldTomlUrl = tomlContent.match(/application_url = "([^"]+)"/)?.[1];

    tomlContent = tomlContent.replace(
      /application_url = "[^"]*"/,
      `application_url = "${trimmedUrl}"`
    );

    // Replace redirect_urls (handling single line format)
    tomlContent = tomlContent.replace(
      /redirect_urls = \[\s*"[^"]*"\s*\]/g,
      `redirect_urls = ["${trimmedUrl}/api/auth/callback"]`
    );

    // Also handle possible multi-line format
    tomlContent = tomlContent.replace(
      /redirect_urls = \[\s*\n\s*"[^"]*"\s*\n\s*\]/g,
      `redirect_urls = [\n  "${trimmedUrl}/api/auth/callback"\n]`
    );

    fs.writeFileSync(tomlPath, tomlContent, 'utf8');
    console.log(`\n✅ ${file} updated`);
    console.log(`   OLD: ${oldTomlUrl}`);
    console.log(`   NEW: ${trimmedUrl}`);
  }
});

console.log('\n📋 Next steps:');
console.log('  1. Run: npx shopify app deploy --allow-updates  ← pushes new URL to Partner Dashboard');
console.log(`  2. Test: curl ${trimmedUrl}/api/health`);
console.log('  3. Reinstall app from Partner Dashboard or open dev store');

