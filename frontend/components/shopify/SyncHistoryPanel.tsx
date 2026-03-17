/**
 * Phase 2: Sync History & Monitoring Panel
 * 
 * Displays:
 *  - Sync summary (last 24 hours stats)
 *  - API call history from PROVIDER_SERVICE_RESPONSES
 *  - Product sync queue from EXT_PRODUCTS_ACTIVITY
 *  - Recent errors
 * 
 * Data sources (VisionSuite SSOT):
 *  - OMNI.PROVIDER_SERVICE_RESPONSES
 *  - MERCH.EXT_PRODUCTS_ACTIVITY
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../src/api/config';
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, FileText, Package } from 'lucide-react';

interface SyncSummary {
  lastSyncDate: Date | null;
  last24Hours: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: number;
  };
  productQueue: {
    pending: number;
    processed: number;
    errors: number;
  };
  recentErrors: Array<{
    timestamp: Date;
    service: string;
    error: string;
  }>;
}

interface SyncHistoryLog {
  logId: number;
  timestamp: Date;
  service: string;
  status: string;
  message: string;
  errorCode: string | null;
  requestPreview: string;
  responsePreview: string;
  transactionId: string;
  type: string;
}

interface ProductActivity {
  styleId: string;
  bannerId: string;
  description: string;
  activityType: 'A' | 'C' | 'D';
  status: 'N' | 'Y' | 'E';
  createdDate: Date;
  processedDate: Date | null;
  shopifyProductId: number | null;
}

interface SyncHistoryPanelProps {
  bannerId: string;
}

const SyncHistoryPanel: React.FC<SyncHistoryPanelProps> = ({ bannerId }) => {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [logs, setLogs] = useState<SyncHistoryLog[]>([]);
  const [activities, setActivities] = useState<ProductActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'logs' | 'products'>('summary');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [bannerId]);

  const fetchData = async () => {
    try {
      // Fetch summary
      const summaryRes = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/sync-summary`);
      const summaryData = await summaryRes.json();
      if (summaryData.success) setSummary(summaryData.data);

      // Fetch logs (last 20)
      const logsRes = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/sync-history?limit=20`);
      const logsData = await logsRes.json();
      if (logsData.success) setLogs(logsData.data.logs || []);

      // Fetch product activities
      const activitiesRes = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/product-sync?limit=20`);
      const activitiesData = await activitiesRes.json();
      if (activitiesData.success) setActivities(activitiesData.data.activities || []);
    } catch (e) {
      console.error('Failed to fetch sync data', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'summary'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          API Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'products'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Product Queue ({summary.productQueue.pending + summary.productQueue.processed + summary.productQueue.errors})
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Last 24 Hours Stats */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <RefreshCw size={18} className="text-blue-600" />
              Last 24 Hours Activity
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <div className="text-sm text-gray-600">Total API Calls</div>
                <div className="text-3xl font-bold text-gray-900 mt-1">{summary.last24Hours.totalCalls}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <div className="text-sm text-gray-600">Successful</div>
                <div className="text-3xl font-bold text-green-600 mt-1">{summary.last24Hours.successfulCalls}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-red-100">
                <div className="text-sm text-gray-600">Failed</div>
                <div className="text-3xl font-bold text-red-600 mt-1">{summary.last24Hours.failedCalls}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-bold text-gray-900">{summary.last24Hours.successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 transition-all ${
                    summary.last24Hours.successRate >= 90 ? 'bg-green-500' :
                    summary.last24Hours.successRate >= 70 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${summary.last24Hours.successRate}%` }}
                />
              </div>
            </div>
            {summary.lastSyncDate && (
              <div className="mt-3 text-xs text-gray-500">
                Last sync: {new Date(summary.lastSyncDate).toLocaleString()}
              </div>
            )}
          </div>

          {/* Product Queue Stats */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package size={18} className="text-purple-600" />
              Product Sync Queue
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border border-amber-100">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-sm text-gray-600">Pending</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{summary.productQueue.pending}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-sm text-gray-600">Processed</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{summary.productQueue.processed}</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-red-100">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle size={14} className="text-red-500" />
                  <span className="text-sm text-gray-600">Errors</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{summary.productQueue.errors}</div>
              </div>
            </div>
          </div>

          {/* Recent Errors */}
          {summary.recentErrors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-6 border border-red-200">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-600" />
                Recent Errors
              </h4>
              <div className="space-y-2">
                {summary.recentErrors.map((err, idx) => (
                  <div key={idx} className="bg-white rounded p-3 border border-red-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-xs font-mono text-gray-500">
                          {new Date(err.timestamp).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium text-gray-900 mt-1">{err.service}</div>
                        <div className="text-sm text-red-600 mt-1">{err.error}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-lg border border-gray-200">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No API logs yet</p>
              <p className="text-sm mt-1">Logs will appear here after Shopify API interactions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map(log => (
                <div key={log.logId} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                          log.status.startsWith('2') ? 'bg-green-100 text-green-700' :
                          log.status.startsWith('4') ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {log.status}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{log.service}</span>
                        <span className="text-xs text-gray-500 font-mono">{log.transactionId}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      {log.message && (
                        <div className="text-sm text-gray-700 mt-2">{log.message}</div>
                      )}
                      {log.errorCode && (
                        <div className="text-sm text-red-600 mt-1">Error: {log.errorCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product Queue Tab */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-lg border border-gray-200">
          {activities.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No product activities yet</p>
              <p className="text-sm mt-1">Product sync activities will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activities.map((activity, idx) => (
                <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                          activity.status === 'Y' ? 'bg-green-100 text-green-700' :
                          activity.status === 'N' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {activity.status === 'Y' ? 'Processed' : activity.status === 'N' ? 'Pending' : 'Error'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          activity.activityType === 'A' ? 'bg-blue-100 text-blue-700' :
                          activity.activityType === 'C' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {activity.activityType === 'A' ? 'Add' : activity.activityType === 'C' ? 'Change' : 'Delete'}
                        </span>
                        <span className="text-sm font-mono text-gray-600">{activity.styleId}</span>
                      </div>
                      <div className="text-sm text-gray-900 font-medium mt-2">{activity.description || 'No description'}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Created: {new Date(activity.createdDate).toLocaleString()}
                        {activity.processedDate && ` | Processed: ${new Date(activity.processedDate).toLocaleString()}`}
                      </div>
                      {activity.shopifyProductId && (
                        <div className="text-xs text-indigo-600 mt-1">Shopify ID: {activity.shopifyProductId}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <RefreshCw size={14} />
          Refresh Data
        </button>
      </div>
    </div>
  );
};

export default SyncHistoryPanel;
