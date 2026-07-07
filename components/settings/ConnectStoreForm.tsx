"use client";
import React, { useState } from 'react';
import { Card, Button } from '../common';
import { TextField, InlineStack, BlockStack } from '@shopify/polaris';

export function ConnectStoreForm() {
  const [shopDomain, setShopDomain] = useState('');
  const [error, setError] = useState('');

  const handleConnect = () => {
    if (!shopDomain.trim()) {
      setError('Please enter a store domain');
      return;
    }

    let sanitizedDomain = shopDomain.trim().toLowerCase();

    // Auto-append .myshopify.com if not present
    if (!sanitizedDomain.includes('.')) {
      sanitizedDomain = `${sanitizedDomain}.myshopify.com`;
    }

    setError('');

    // Redirect top level (break out of iframe) to trigger OAuth flow
    const authUrl = `/api/auth?shop=${encodeURIComponent(sanitizedDomain)}`;
    if (window.top) {
      window.top.location.href = authUrl;
    } else {
      window.location.href = authUrl;
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        <h2 className="text-lg font-bold">Connect Another Store</h2>
        <p className="text-sm text-gray-500">
          Enter the Shopify domain of the new store branch (e.g., ESHAN Coimbatore Store) you want to connect.
        </p>
        <InlineStack gap="300" align="start">
          <div style={{ flex: 1 }}>
            <TextField
              label="Shopify Store Domain"
              labelHidden
              value={shopDomain}
              onChange={(val) => {
                setShopDomain(val);
                if (error) setError('');
              }}
              placeholder="example-store.myshopify.com"
              error={error}
              autoComplete="off"
            />
          </div>
          <Button variant="primary" onClick={handleConnect}>
            Connect Store
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
