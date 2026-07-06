const { shopify } = require('./lib/shopify/index');
const { Session } = require('@shopify/shopify-api');

console.log('shopify object exists:', !!shopify);
console.log('shopify.auth.begin exists:', !!shopify?.auth?.begin);
