/**
 * Phase 1: Store Health Dashboard Component
 * 
 * Displays comprehensive store health metrics from VisionSuite SSOT:
 *  - Connection status (PROVIDER_SERVICES health indicators)
 *  - API rate limit (PROVIDER_SERVICE_RESPONSES call tracking)
 *  - Recent activity (V_ECOMM_ORDERS order count)
 *  - Overall health score (0-100)
 * 
 * Data refresh: Every 30 seconds
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../src/api/config';
import { ShopifyTheme, getHealthColor } from './theme';
import SyncHistoryPanel from './SyncHistoryPanel';
import WebhookManagementPanel from './WebhookManagementPanel';
import BulkOperationsPanel from './BulkOperationsPanel';

interface StoreHealth {
  bannerId: string;
  overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
  overallHealthScore: number;
  connection: {
    isActive: boolean;
    isInstalled: boolean;
    isPingable: boolean;
    lastUpdated: Date | null;
    shopifyApiTest: { success: boolean; message: string; details?: any };
  };
  apiHealth: {
    currentRate: number;
    maxRate: number;
    percentage: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  syncConfig: {
    intervalMinutes: number | null;
    apiVersion: string | null;
  };
  recentActivity: {
    ordersLast7Days: number;
    lastOrderDate: Date | null;
  };
  checks: Record<string, boolean>;
}

interface StoreHealthDashboardProps {
  bannerId: string;
  onClose?: () => void;
}

const StoreHealthDashboard: React.FC<StoreHealthDashboardProps> = ({ bannerId, onClose }) => {
  const [health, setHealth] = useState<StoreHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => {
      fetchHealth();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [bannerId]);

  const fetchHealth = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/health`);
      const data = await res.json();
      
      if (data.success) {
        setHealth(data.data);
        setLastRefresh(new Date());
      } else {
        setError(data.error?.message || 'Failed to fetch health data');
      }
    } catch (e: any) {
      console.error('Failed to fetch health', e);
      setError(e.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-purple-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading health data...</p>
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-gray-900 font-semibold mb-2">Failed to load health data</p>
          <p className="text-gray-600 text-sm mb-4">{error || 'Unknown error'}</p>
          <button
            onClick={fetchHealth}
            className={`px-6 py-2 rounded-lg transition-all ${ShopifyTheme.components.button.primary}`}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Get health color from theme
  const healthColorMap: Record<string, ReturnType<typeof getHealthColor>> = {
    excellent: getHealthColor(95),
    good: getHealthColor(80),
    warning: getHealthColor(60),
    critical: getHealthColor(30),
  };

  const healthColor = healthColorMap[health.overallHealth] || healthColorMap.good;

  return (
    <div className={`${ShopifyTheme.spacing.section} p-6 bg-gray-50 rounded-lg max-w-6xl mx-auto`}>
      {/* Header with Gradient Title */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{ShopifyTheme.phases.phase1.icon}</span>
            <h2 className={ShopifyTheme.typography.pageTitle}>{ShopifyTheme.phases.phase1.name}</h2>
          </div>
          <p className={`${ShopifyTheme.typography.caption} flex items-center gap-3`}>
            <span className="font-semibold text-purple-600">{bannerId}</span>
            <span className="text-gray-300">•</span>
            <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
              Auto-refresh: 30s
            </span>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition-colors ${ShopifyTheme.components.button.secondary}`}
          >
            Close
          </button>
        )}
      </div>

      {/* Overall Health Score - Hero Card with Gradient */}
      <div className={`relative overflow-hidden ${healthColor.light} border-2 ${healthColor.border} rounded-xl shadow-xl p-8`}>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none"></div>
        
        <div className="relative flex items-center justify-between">
          <div>
            <h3 className={ShopifyTheme.typography.sectionTitle}>Overall Health Status</h3>
            <p className={`${ShopifyTheme.typography.body} mt-1`}>System health based on 7 critical checks</p>
          </div>
          <div className="flex items-center gap-6">
            {/* Score Circle with gradient border */}
            <div className="relative">
              <div className={`h-28 w-28 rounded-full ${healthColor.light} border-4 ${healthColor.border} flex items-center justify-center shadow-2xl backdrop-blur-sm`}>
                <span className={`text-4xl font-black ${healthColor.text}`}>
                  {health.overallHealthScore}
                </span>
              </div>
              <div className="absolute -top-2 -right-2 text-3xl animate-pulse">
                {health.overallHealthScore >= 90 ? '✨' : health.overallHealthScore >= 70 ? '💙' : health.overallHealthScore >= 50 ? '⚠️' : '🔴'}
              </div>
            </div>
            <div>
              <div className={`text-2xl font-black ${healthColor.text} uppercase tracking-wider`}>
                {health.overallHealth}
              </div>
              <div className="text-sm text-gray-700 mt-1 font-medium">
                {Object.values(health.checks).filter(v => v).length}/{Object.keys(health.checks).length} checks passing
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Connection Status, API Health, Sync Config, Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Connection Status Card */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 text-lg">Connection Status</h4>
            <span className="text-2xl">🔌</span>
          </div>
          <div className="space-y-3">
            <StatusItem label="Service Active" value={health.connection.isActive} />
            <StatusItem label="Service Installed" value={health.connection.isInstalled} />
            <StatusItem label="Endpoint Pingable" value={health.connection.isPingable} />
            <StatusItem label="Shopify API Test" value={health.connection.shopifyApiTest.success} />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Last health check: {health.connection.lastUpdated 
                ? new Date(health.connection.lastUpdated).toLocaleString() 
                : 'Never'}
            </div>
            {health.connection.shopifyApiTest.details && (
              <div className="mt-2 text-xs text-gray-600">
                <strong>Shop:</strong> {health.connection.shopifyApiTest.details.shop}<br/>
                <strong>Domain:</strong> {health.connection.shopifyApiTest.details.domain}<br/>
                <strong>Plan:</strong> {health.connection.shopifyApiTest.details.plan}
              </div>
            )}
          </div>
        </div>

        {/* API Health Card */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 text-lg">API Rate Limit</h4>
            <span className="text-2xl">📊</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Current Usage</span>
                <span className="font-semibold text-gray-900">
                  {health.apiHealth.currentRate} / {health.apiHealth.maxRate} calls/min
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden border border-gray-300">
                <div 
                  className={`h-6 flex items-center justify-center text-xs font-medium text-white transition-all duration-500 ${
                    health.apiHealth.status === 'healthy' ? 'bg-green-500' :
                    health.apiHealth.status === 'warning' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${health.apiHealth.percentage}%` }}
                >
                  {health.apiHealth.percentage}%
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {health.apiHealth.maxRate - health.apiHealth.currentRate} calls available
              </div>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                health.apiHealth.status === 'healthy' ? 'bg-green-100 text-green-700' :
                health.apiHealth.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {health.apiHealth.status === 'healthy' && '✓ Healthy'}
                {health.apiHealth.status === 'warning' && '⚠️ High Usage'}
                {health.apiHealth.status === 'critical' && '🚨 Critical'}
              </span>
              <p className="text-xs text-gray-500 mt-2">
                Shopify limit: 500 calls/minute
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 text-lg">Recent Activity</h4>
            <span className="text-2xl">📦</span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Orders (Last 7 days)</span>
              <span className="text-3xl font-bold text-indigo-600">
                {health.recentActivity.ordersLast7Days}
              </span>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">Last Order Received</div>
              <div className="text-lg font-medium text-gray-900 mt-1">
                {health.recentActivity.lastOrderDate 
                  ? new Date(health.recentActivity.lastOrderDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'No orders yet'}
              </div>
            </div>
          </div>
        </div>

        {/* Sync Configuration Card */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 text-lg">Sync Configuration</h4>
            <span className="text-2xl">⚙️</span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Sync Interval</span>
              <span className="text-lg font-medium text-gray-900">
                {health.syncConfig.intervalMinutes 
                  ? `${health.syncConfig.intervalMinutes} min` 
                  : 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-600">Shopify API Version</span>
              <span className="text-lg font-medium text-gray-900">
                {health.syncConfig.apiVersion || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Checks Breakdown */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h4 className="font-semibold text-gray-900 text-lg mb-4">Health Checks Breakdown</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(health.checks).map(([check, passed]) => (
            <div key={check} className="flex items-center gap-2">
              <span className={`text-xl ${passed ? 'text-green-500' : 'text-red-500'}`}>
                {passed ? '✓' : '✗'}
              </span>
              <span className="text-sm text-gray-700 capitalize">
                {check.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 2: Sync History & Monitoring */}
      <div className={`${ShopifyTheme.components.card.base} ${ShopifyTheme.components.card.hover}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{ShopifyTheme.phases.phase2.icon}</span>
          <h4 className={ShopifyTheme.typography.sectionTitle}>{ShopifyTheme.phases.phase2.name}</h4>
        </div>
        <SyncHistoryPanel bannerId={bannerId} />
      </div>

      {/* Phase 4: Webhook Management */}
      <div className={`${ShopifyTheme.components.card.base} ${ShopifyTheme.components.card.hover}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{ShopifyTheme.phases.phase4.icon}</span>
          <h4 className={ShopifyTheme.typography.sectionTitle}>{ShopifyTheme.phases.phase4.name}</h4>
        </div>
        <WebhookManagementPanel bannerId={bannerId} />
      </div>

      {/* Phase 5: Bulk Operations */}
      <div className={`${ShopifyTheme.components.card.base} ${ShopifyTheme.components.card.hover}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{ShopifyTheme.phases.phase5.icon}</span>
          <h4 className={ShopifyTheme.typography.sectionTitle}>{ShopifyTheme.phases.phase5.name}</h4>
        </div>
        <BulkOperationsPanel bannerId={bannerId} />
      </div>

      {/* Refresh Button */}
      <div className="flex justify-center">
        <button
          onClick={fetchHealth}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-medium"
        >
          🔄 Refresh Now
        </button>
      </div>
    </div>
  );
};

// Helper component for status items
const StatusItem: React.FC<{ label: string; value: boolean }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600">{label}</span>
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
      value 
        ? 'bg-green-100 text-green-700 border border-green-300' 
        : 'bg-red-100 text-red-700 border border-red-300'
    }`}>
      {value ? '✓ Yes' : '✗ No'}
    </span>
  </div>
);

export default StoreHealthDashboard;
