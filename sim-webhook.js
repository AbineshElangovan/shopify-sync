const crypto = require('crypto');
const http = require('http');

const SECRET = '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';
const payload = JSON.stringify({ id: 8516416700607 }); // The product ID of PID-00000002

const hmac = crypto.createHmac('sha256', SECRET).update(payload, 'utf8', 'hex').digest('base64');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/webhooks/products-delete',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Topic': 'products/delete',
    'X-Shopify-Shop-Domain': 'eshan-coimbatore-store-8jjdfk4t.myshopify.com',
    'X-Shopify-Hmac-Sha256': hmac,
    'X-Shopify-Webhook-Id': 'simulated-webhook-id-' + Date.now()
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
});

req.write(payload);
req.end();
