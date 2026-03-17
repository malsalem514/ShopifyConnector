import React from 'react';
import { ShopifyHubPage } from './pages/ShopifyHubPage';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center">
        <h1 className="text-lg font-bold tracking-tight text-gray-900">
          FarsightIQ <span className="text-green-600">Shopify Hub</span>
        </h1>
      </header>
      <main className="flex-1">
        <ShopifyHubPage />
      </main>
    </div>
  );
}
