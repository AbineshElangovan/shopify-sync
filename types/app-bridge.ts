
export {};

declare global {
  interface Window {
    shopify: {
      idToken: () => Promise<string>;
      [key: string]: any;
    };
  }
}