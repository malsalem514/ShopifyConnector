/**
 * Phase 5: Bulk Operations Panel
 * 
 * Execute bulk operations on Shopify store:
 *  - Bulk inventory update from VisionSuite
 *  - Bulk product publish
 *  - Bulk tag management
 *  - Full catalog reset (dangerous)
 * 
 * All operations read from VisionSuite SSOT
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import React, { useState } from 'react';
import { API_BASE_URL } from '../../src/api/config';
import { ShopifyTheme } from './theme';
import { Package, Upload, Tag, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface BulkOperationsPanelProps {
  bannerId: string;
}

interface OperationResult {
  success: boolean;
  updatedCount?: number;
  publishedCount?: number;
  failedCount?: number;
  errors?: string[];
}

const BulkOperationsPanel: React.FC<BulkOperationsPanelProps> = ({ bannerId }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ operation: string; result: OperationResult } | null>(null);

  const executeOperation = async (operationId: string, endpoint: string, body?: any) => {
    setLoading(operationId);
    setLastResult(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();

      setLastResult({
        operation: operationId,
        result: data.success ? data.data : { success: false, errors: [data.error?.message || 'Unknown error'] }
      });

      if (data.success) {
        alert(`Operation completed successfully!`);
      } else {
        alert(`Operation failed: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      setLastResult({
        operation: operationId,
        result: { success: false, errors: [e.message] }
      });
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(null);
    }
  };

  const operations = [
    {
      id: 'bulk-inventory',
      title: 'Bulk Inventory Update',
      description: 'Sync all inventory levels from VisionSuite to Shopify',
      icon: <Package className="text-purple-600" size={24} />,
      action: () => executeOperation('bulk-inventory', `${API_BASE_URL}/shopify/stores/${bannerId}/bulk/inventory`),
      color: ShopifyTheme.components.card.primary.replace('bg-gradient-to-br', 'bg-gradient-to-br'),
      buttonColor: ShopifyTheme.components.button.primary
    },
    {
      id: 'bulk-publish',
      title: 'Bulk Product Publish',
      description: 'Publish selected styles from VisionSuite to Shopify',
      icon: <Upload className="text-emerald-600" size={24} />,
      action: () => {
        const styles = prompt('Enter style IDs (comma-separated):');
        if (styles) {
          const styleIds = styles.split(',').map(s => s.trim());
          executeOperation('bulk-publish', `${API_BASE_URL}/shopify/stores/${bannerId}/bulk/publish`, { styleIds });
        }
      },
      color: ShopifyTheme.components.card.success,
      buttonColor: ShopifyTheme.components.button.success
    },
    {
      id: 'bulk-tags',
      title: 'Bulk Tag Management',
      description: 'Add or remove tags from all products in bulk',
      icon: <Tag className="text-pink-600" size={24} />,
      action: () => {
        alert('Coming soon: Bulk tag management UI');
      },
      color: 'bg-gradient-to-br from-pink-50 to-purple-50 border-2 border-pink-200',
      buttonColor: 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700',
      disabled: true
    },
    {
      id: 'full-reset',
      title: 'Full Catalog Reset',
      description: '⚠️ DANGER: Delete all products + re-sync from VisionSuite',
      icon: <AlertTriangle className="text-red-600" size={24} />,
      action: () => {
        if (confirm('⚠️ WARNING: This will DELETE ALL products from Shopify and re-sync from VisionSuite. This cannot be undone. Continue?')) {
          if (confirm('Are you absolutely sure? Type "DELETE" to confirm.') && prompt('Type DELETE to continue:') === 'DELETE') {
            alert('Full catalog reset would execute here (not yet implemented for safety)');
          }
        }
      },
      color: ShopifyTheme.components.card.danger,
      buttonColor: ShopifyTheme.components.button.danger,
      disabled: true
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-semibold text-gray-900">Bulk Operations</h4>
        <p className="text-sm text-gray-500 mt-1">Execute large-scale operations on your Shopify store</p>
      </div>

      {/* Result Display */}
      {lastResult && (
        <div className={`p-4 rounded-lg border-2 ${
          lastResult.result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            {lastResult.result.success ? (
              <CheckCircle2 className="text-green-600 flex-shrink-0" size={20} />
            ) : (
              <XCircle className="text-red-600 flex-shrink-0" size={20} />
            )}
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 mb-1">
                {lastResult.operation.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Result
              </h5>
              {lastResult.result.updatedCount !== undefined && (
                <p className="text-sm text-gray-700">Updated: {lastResult.result.updatedCount}</p>
              )}
              {lastResult.result.publishedCount !== undefined && (
                <p className="text-sm text-gray-700">Published: {lastResult.result.publishedCount}</p>
              )}
              {lastResult.result.failedCount !== undefined && (
                <p className="text-sm text-gray-700">Failed: {lastResult.result.failedCount}</p>
              )}
              {lastResult.result.errors && lastResult.result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-800">Errors:</p>
                  <ul className="text-xs text-red-700 mt-1 space-y-1">
                    {lastResult.result.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>• {err}</li>
                    ))}
                    {lastResult.result.errors.length > 5 && (
                      <li>• ... and {lastResult.result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Operations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {operations.map(op => (
          <div
            key={op.id}
            className={`bg-gradient-to-br ${op.color} rounded-lg border-2 p-6 ${
              op.disabled ? 'opacity-50' : 'hover:shadow-lg transition-shadow'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white rounded-lg shadow-sm">
                {op.icon}
              </div>
              {op.disabled && (
                <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded">
                  Coming Soon
                </span>
              )}
            </div>
            <h5 className="font-bold text-gray-900 mb-2">{op.title}</h5>
            <p className="text-sm text-gray-600 mb-4">{op.description}</p>
            <button
              onClick={op.action}
              disabled={op.disabled || loading === op.id}
              className={`w-full px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                op.disabled ? 'bg-gray-400 cursor-not-allowed' : op.buttonColor
              }`}
            >
              {loading === op.id ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                'Execute'
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Safety Warning */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
          <div>
            <h6 className="font-semibold text-amber-900 mb-1">Important Notice</h6>
            <p className="text-sm text-amber-800">
              Bulk operations affect multiple products at once. Always test on a small subset first.
              All operations read from VisionSuite as the Single Source of Truth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkOperationsPanel;
