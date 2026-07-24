const crypto = require('crypto');
const http = require('http');

const SECRET = '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';

// We need a full payload for products-create so it doesn't crash
const payload = JSON.stringify({ 
  id: 77777777777,
  title: "New Dev Server Test Product",
  variants: [
    {
      id: 88888888888,
      admin_graphql_api_id: "gid://shopify/ProductVariant/88888888888",
      sku: "TEST-DEV-SERVER-001"
    }
  ]
}); 

const hmac = crypto.createHmac('sha256', SECRET).update(payload, 'utf8', 'hex').digest('base64');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/webhooks/products-create',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Topic': 'products/create',
    'X-Shopify-Shop-Domain': 'eshan-coimbatore-store-8jjdfk4t.myshopify.com', // Master Store
    'X-Shopify-Hmac-Sha256': hmac,
    'X-Shopify-Webhook-Id': 'simulated-create-webhook-' + Date.now()
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
