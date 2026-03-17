/**
 * Phase 4: Webhook Management Panel
 * 
 * Manage Shopify webhooks:
 *  - List all registered webhooks
 *  - Create new webhooks
 *  - Delete existing webhooks
 *  - View webhook delivery logs from PROVIDER_SERVICE_RESPONSES
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../src/api/config';
import { ShopifyTheme } from './theme';
import { RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2, Webhook } from 'lucide-react';

interface WebhookData {
  id: string;
  topic: string;
  address: string;
  format: string;
  created_at: string;
}

interface WebhookManagementPanelProps {
  bannerId: string;
}

const WEBHOOK_TOPICS = [
  { value: 'orders/create', label: 'Orders Created' },
  { value: 'orders/updated', label: 'Orders Updated' },
  { value: 'orders/cancelled', label: 'Orders Cancelled' },
  { value: 'products/create', label: 'Products Created' },
  { value: 'products/update', label: 'Products Updated' },
  { value: 'products/delete', label: 'Products Deleted' },
  { value: 'inventory_items/update', label: 'Inventory Updated' },
  { value: 'fulfillments/create', label: 'Fulfillments Created' },
  { value: 'fulfillments/update', label: 'Fulfillments Updated' }
];

const WebhookManagementPanel: React.FC<WebhookManagementPanelProps> = ({ bannerId }) => {
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    topic: 'orders/create',
    address: '',
    format: 'json'
  });

  useEffect(() => {
    fetchWebhooks();
  }, [bannerId]);

  const fetchWebhooks = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/webhooks`);
      const data = await res.json();
      if (data.success) {
        setWebhooks(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch webhooks', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newWebhook.address.trim()) {
      alert('Please enter a webhook URL');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWebhook)
      });
      const data = await res.json();
      
      if (data.success) {
        alert('Webhook created successfully');
        setShowAddModal(false);
        setNewWebhook({ topic: 'orders/create', address: '', format: 'json' });
        fetchWebhooks();
      } else {
        alert(`Failed: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm('Delete this webhook?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/webhooks/${webhookId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.success) {
        alert('Webhook deleted successfully');
        fetchWebhooks();
      } else {
        alert(`Failed: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin text-indigo-600" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={ShopifyTheme.typography.body}>{webhooks.length} webhooks registered</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchWebhooks}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 ${ShopifyTheme.components.button.ghost}`}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 ${ShopifyTheme.components.button.primary}`}
          >
            <Plus size={14} />
            Add Webhook
          </button>
        </div>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Webhook size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium">No webhooks configured</p>
          <p className="text-sm text-gray-500 mt-1">Add a webhook to receive real-time notifications</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Add Your First Webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`${ShopifyTheme.components.badge.primary} uppercase`}>
                      {webhook.topic}
                    </span>
                    <span className={ShopifyTheme.components.badge.success}>
                      <CheckCircle2 size={12} className="inline mr-1" />
                      Active
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 font-mono break-all">{webhook.address}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    Format: {webhook.format.toUpperCase()} | Created: {new Date(webhook.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(webhook.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete webhook"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Webhook Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Add Webhook</h3>
              <p className="text-sm text-gray-500 mt-1">Configure a new webhook endpoint</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook Topic
                </label>
                <select
                  value={newWebhook.topic}
                  onChange={(e) => setNewWebhook({ ...newWebhook, topic: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {WEBHOOK_TOPICS.map((topic) => (
                    <option key={topic.value} value={topic.value}>
                      {topic.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook URL
                </label>
                <input
                  type="url"
                  value={newWebhook.address}
                  onChange={(e) => setNewWebhook({ ...newWebhook, address: e.target.value })}
                  placeholder="https://your-app.com/webhooks/shopify"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Format
                </label>
                <select
                  value={newWebhook.format}
                  onChange={(e) => setNewWebhook({ ...newWebhook, format: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Webhooks will be delivered to your URL in real-time. Ensure your endpoint is accessible and can handle POST requests.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewWebhook({ topic: 'orders/create', address: '', format: 'json' });
                }}
                className={`px-4 py-2 rounded-lg ${ShopifyTheme.components.button.ghost}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className={`px-4 py-2 rounded-lg ${ShopifyTheme.components.button.primary}`}
              >
                Create Webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhookManagementPanel;
