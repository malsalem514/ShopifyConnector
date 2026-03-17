import React, { useState, useEffect, useCallback } from 'react';
import { 
  Store, Package, ShoppingCart, Warehouse, GitBranch, 
  Clock, BarChart3, Search, Filter, RefreshCw, 
  ExternalLink, ChevronRight, CheckCircle2, AlertCircle,
  MoreVertical, Play, Pause, Power, ArrowRight, ShoppingBag,
  Plus, Sparkles, Server, X, Activity, Settings, Image as ImageIcon,
  Trash2, Zap, Upload, Tag, Download, Grid3x3, List
} from 'lucide-react';
import { API_BASE_URL } from '../src/api/config';
import { Button, StatusBadge } from '../components/shared/UI';
import { 
  QuickActionsPanel, 
  AddStoreModal, 
  CreateProductModal, 
  DeleteConfirmModal,
  InventorySyncPanel,
  LiveStoreStatsCard,
  VisionSuitePublisher,
  ShopifyScopePublisher,
  StoreHealthDashboard,
  DiscountManagementPanel,
  OrderOriginFilter,
  OrderCard
} from '../components/shopify';

type ShopifyTab = 'dashboard' | 'stores' | 'products' | 'orders' | 'inventory' | 'mapping' | 'jobs' | 'logs' | 'config' | 'abandoned' | 'analytics' | 'discounts';

export const ShopifyHubPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ShopifyTab>('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncHealth, setSyncHealth] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/stats?business_unit_id=1`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSyncHealth({
            syncedCount: d.data.syncedProducts || 0,
            lastSync: '2m ago',
            status: 'healthy'
          });
        }
      })
      .catch(err => console.error('Sync health fetch error:', err));
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'analytics', label: 'Revenue', icon: ArrowRight },
    { id: 'stores', label: 'Stores', icon: Store },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'abandoned', label: 'Abandoned', icon: ShoppingBag },
    { id: 'discounts', label: 'Discounts', icon: Tag },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'mapping', label: 'Mapping', icon: GitBranch },
    { id: 'jobs', label: 'Jobs', icon: Clock },
    { id: 'logs', label: 'Sync Logs', icon: Activity },
    { id: 'config', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Live Ticker */}
      <ShopifyLiveTicker />

      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-8 py-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ShopifyTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id 
                  ? 'bg-purple-50 text-purple-700 shadow-sm' 
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
              data-testid={`shopify-tab-${tab.id}`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {syncHealth && (
          <div className="flex items-center gap-3 animate-in fade-in duration-700">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Global Sync Status</span>
              <span className="text-[9px] text-emerald-500 font-bold mt-1">Synced {syncHealth.lastSync}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-tight">
                {syncHealth.syncedCount.toLocaleString()} Products Synced
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
        {activeTab === 'dashboard' && <ShopifyDashboard />}
        {activeTab === 'analytics' && <ShopifyAnalytics />}
        {activeTab === 'stores' && <ShopifyStores />}
        {activeTab === 'products' && <ShopifyProducts />}
        {activeTab === 'orders' && <ShopifyOrders />}
        {activeTab === 'abandoned' && <ShopifyAbandonedCarts />}
        {activeTab === 'discounts' && <ShopifyDiscounts />}
        {activeTab === 'jobs' && <ShopifyJobs />}
        {activeTab === 'mapping' && <ShopifyMapping />}
        {activeTab === 'inventory' && <ShopifyInventory />}
        {activeTab === 'logs' && <ShopifySyncLogs />}
        {activeTab === 'config' && <ShopifyConfig />}
      </div>
    </div>
  );
};

// ============================================================================
// LIVE TICKER
// ============================================================================

const ShopifyLiveTicker: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [isDemo, setIsDemo] = useState(true);

  const fetchLiveEvents = useCallback(async () => {
    try {
      const [logsRes, ordersRes, configRes] = await Promise.all([
        fetch(`${API_BASE_URL}/shopify/logs?limit=5`).then(r => r.json()),
        fetch(`${API_BASE_URL}/shopify/orders?limit=5`).then(r => r.json()),
        fetch(`${API_BASE_URL}/shopify/config`).then(r => r.json())
      ]);

      // Check if demo mode is enabled
      const demoEnabled = configRes.data?.isDemo !== false;
      setIsDemo(demoEnabled);

      const newEvents: any[] = [];
      
      if (ordersRes.success && ordersRes.data) {
        const orderList = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data.orders || []);
        orderList.forEach((o: any) => {
          newEvents.push({
            id: `order-${o.orderId}`,
            type: 'order',
            text: `New Order #${o.wfeTransId || o.orderId} from Store ${o.siteId} - ${o.status}`,
            time: o.isDemo ? 'Demo' : 'Live',
            isDemo: o.isDemo
          });
        });
      }

      if (logsRes.success && logsRes.data) {
        const logList = Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.logs || []);
        logList.forEach((l: any) => {
          if (l.ACTION_TYPE === 'PUBLISH' && l.STATUS === 'SUCCESS') {
            newEvents.push({
              id: `sync-${l.LOG_ID}`,
              type: 'sync',
              text: `Product ${l.ENTITY_ID} published to ${l.BANNER_ID}`,
              time: l.isDemo ? 'Demo' : 'Recent',
              isDemo: l.isDemo
            });
          }
        });
      }

      // NO hardcoded fallback - show empty state if no real events
      setEvents(newEvents);
    } catch (e) {
      console.warn('Failed to fetch live events', e);
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    fetchLiveEvents();
    const interval = setInterval(fetchLiveEvents, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchLiveEvents]);

  return (
    <div className="bg-purple-900 text-purple-100 py-1.5 px-8 overflow-hidden whitespace-nowrap border-b border-purple-800 flex items-center gap-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${events.length > 0 ? 'bg-rose-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-[10px] font-black uppercase tracking-widest">Live Feed</span>
        {!isDemo && <span className="text-[8px] text-emerald-400 font-bold ml-1">PRODUCTION</span>}
      </div>
      {events.length === 0 ? (
        <div className="text-[10px] text-purple-300 italic">No live events — waiting for real-time activity...</div>
      ) : (
        <div className="flex gap-12 animate-ticker">
          {events.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-[10px] font-bold">
              {ev.type === 'order' ? <ShoppingBag size={10} className="text-emerald-400" /> : <Activity size={10} className="text-blue-400" />}
              <span>{ev.text}</span>
              <span className={`font-medium tabular-nums ${ev.isDemo ? 'text-amber-400' : 'text-purple-400'}`}>{ev.time}</span>
            </div>
          ))}
          {/* Duplicate for seamless loop */}
          {events.map(ev => (
            <div key={`dup-${ev.id}`} className="flex items-center gap-2 text-[10px] font-bold">
              {ev.type === 'order' ? <ShoppingBag size={10} className="text-emerald-400" /> : <Activity size={10} className="text-blue-400" />}
              <span>{ev.text}</span>
              <span className={`font-medium tabular-nums ${ev.isDemo ? 'text-amber-400' : 'text-purple-400'}`}>{ev.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HIERARCHY MAPPING
// ============================================================================

const ShopifyMapping: React.FC = () => {
  const [mappings, setMappings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMapping, setIsMapping] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchMappings = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/shopify/mapping?business_unit_id=1`)
      .then(r => r.json())
      .then(d => { if (d.success) setMappings(d.data || []); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchMappings(); }, []);

  const handleAutoMap = async (merchandiseNo: string) => {
    setIsMapping(merchandiseNo);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/mapping/auto-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_unit_id: 1, merchandise_no: merchandiseNo })
      });
      const data = await res.json();
      if (data.success) {
        setMappings(prev => prev.map(m => 
          m.merchandiseNo === merchandiseNo ? { 
            ...m, 
            shopifyProductType: data.data.shopifyProductType,
            mappedBy: 'AI',
            aiConfidence: data.data.aiConfidence,
            alternatives: data.data.alternatives
          } : m
        ));
      }
    } catch (e) {}
    setIsMapping(null);
  };

  const handleSaveMapping = async (merchandiseNo: string, productType: string) => {
    try {
      await fetch(`${API_BASE_URL}/shopify/mapping/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          business_unit_id: 1, 
          merchandise_no: merchandiseNo,
          shopify_product_type: productType 
        })
      });
      setMappings(prev => prev.map(m => 
        m.merchandiseNo === merchandiseNo ? { ...m, shopifyProductType: productType, mappedBy: 'MANUAL' } : m
      ));
    } catch (e) {}
  };

  const filtered = mappings.filter(m => 
    m.vsPath.toLowerCase().includes(search.toLowerCase()) || 
    m.shopifyProductType?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Hierarchy Mapping</h3>
          <p className="text-sm text-gray-500 mt-1">Map VisionSuite categories to Shopify Product Types with AI assistance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search category..." 
              className="h-9 pl-9 pr-3 w-64 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-purple-400"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchMappings} data-testid="mapping-refresh-btn">Refresh</Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-6 py-4 text-left">VisionSuite Hierarchy</th>
              <th className="px-6 py-4 text-left">Shopify Product Type</th>
              <th className="px-6 py-4 text-center">Confidence</th>
              <th className="px-6 py-4 text-center">Source</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={5} className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-400 text-sm">No hierarchy categories found</td></tr>
            ) : filtered.map(item => (
              <tr key={item.merchandiseNo} className="hover:bg-gray-50/50 transition-colors" data-testid="mapping-row">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-900" data-testid="vs-path">{item.vsPath}</span>
                    <span className="text-[9px] text-gray-400 uppercase tracking-tighter tabular-nums">{item.merchandiseNo}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="relative group">
                    <input 
                      type="text"
                      className={`w-full h-8 px-3 rounded text-xs font-medium border transition-all outline-none ${
                        item.shopifyProductType ? 'bg-white border-gray-200 focus:border-purple-400' : 'bg-amber-50/50 border-amber-100 placeholder:text-amber-400'
                      }`}
                      placeholder="Enter product type..."
                      value={item.shopifyProductType || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMappings(prev => prev.map(m => 
                          m.merchandiseNo === item.merchandiseNo ? { ...m, shopifyProductType: val } : m
                        ));
                      }}
                      onBlur={(e) => {
                        handleSaveMapping(item.merchandiseNo, e.target.value);
                      }}
                      data-testid="shopify-type-input"
                    />
                    {item.alternatives?.length > 0 && (
                      <div className="hidden group-hover:block absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-xl border border-gray-100 z-10 min-w-[200px] animate-in slide-in-from-top-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">AI Alternatives</p>
                        <div className="flex flex-wrap gap-1">
                          {item.alternatives.map((alt: string) => (
                            <button 
                              key={alt}
                              onClick={() => handleSaveMapping(item.merchandiseNo, alt)}
                              className="px-2 py-0.5 bg-gray-50 hover:bg-purple-50 text-gray-600 hover:text-purple-600 rounded text-[10px] font-medium transition-colors"
                            >
                              {alt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  {item.aiConfidence ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${item.aiConfidence >= 80 ? 'bg-emerald-500' : item.aiConfidence >= 50 ? 'bg-purple-500' : 'bg-amber-500'}`}
                          style={{ width: `${item.aiConfidence}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-black text-gray-400">{item.aiConfidence}%</span>
                    </div>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 text-center">
                  {item.mappedBy ? (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      item.mappedBy === 'AI' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {item.mappedBy}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-gray-300 uppercase italic">Unmapped</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Button 
                    variant="outline" 
                    size="xs" 
                    isLoading={isMapping === item.merchandiseNo}
                    icon={<Sparkles size={12} />}
                    onClick={() => handleAutoMap(item.merchandiseNo)}
                    disabled={isMapping !== null}
                    data-testid="auto-map-btn"
                  >
                    AI Map
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// ABANDONED CARTS
// ============================================================================

const ShopifyAbandonedCarts: React.FC = () => {
  const [carts, setCarts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/carts/abandoned?business_unit_id=1`)
      .then(r => r.json())
      .then(d => { if (d.success) setCarts(d.data || []); })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Abandoned Checkouts</h3>
          <p className="text-sm text-gray-500 mt-1">Monitor lost revenue opportunities and recover sales</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
          <Sparkles size={14} className="text-amber-500" />
          <span className="text-xs font-bold">Estimated Recovery: ${Number(carts.reduce((acc, c) => acc + c.value, 0) * 0.15).toFixed(2)}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-6 py-4 text-left">Customer Email</th>
              <th className="px-6 py-4 text-center">Cart Value</th>
              <th className="px-6 py-4 text-center">Items</th>
              <th className="px-6 py-4 text-center">Abandoned At</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={5} className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></td></tr>
            ) : carts.length === 0 ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-400 italic">No abandoned checkouts found</td></tr>
            ) : carts.map(cart => (
              <tr key={cart.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <span className="text-xs font-bold text-gray-900">{cart.email}</span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-xs font-black text-gray-900">${cart.value.toLocaleString()}</span>
                </td>
                <td className="px-6 py-4 text-center text-xs text-gray-500">{cart.items} items</td>
                <td className="px-6 py-4 text-center text-xs text-gray-400">{new Date(cart.abandonedAt).toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <Button variant="outline" size="xs" icon={<ArrowRight size={12} />}>Send Recovery Email</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// DISCOUNTS
// ============================================================================

const ShopifyDiscounts: React.FC = () => {
  const [stores, setStores] = useState<any[]>([]);
  const [selectedBanner, setSelectedBanner] = useState<string>('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/stores`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.length > 0) {
          setStores(d.data);
          // API returns lowercase 'bannerId'
          setSelectedBanner(d.data[0].bannerId || d.data[0].BANNER_ID || '');
        }
      })
      .catch(err => console.error('Failed to fetch stores', err));
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Discount Management</h3>
          <p className="text-sm text-gray-500 mt-1">Create and manage discount codes and automatic discounts</p>
        </div>
        {stores.length > 1 && (
          <select
            value={selectedBanner}
            onChange={(e) => setSelectedBanner(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            {stores.map(store => (
              <option key={store.bannerId || store.BANNER_ID} value={store.bannerId || store.BANNER_ID}>
                {store.description || store.BANNER_NAME || store.bannerId || store.BANNER_ID}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedBanner ? (
        <DiscountManagementPanel bannerId={selectedBanner} />
      ) : (
        <div className="text-center py-20 text-gray-400 italic">
          No stores connected. Please configure a store first.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================

const ShopifyDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [period, setPeriod] = useState('today');
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/shopify/stats?business_unit_id=1&period=${period}`).then(r => r.json()),
      fetch(`${API_BASE_URL}/shopify/logs?limit=5`).then(r => r.json()),
      fetch(`${API_BASE_URL}/shopify/inventory/alerts?business_unit_id=1`).then(r => r.json())
    ]).then(([statsData, logsData, alertsData]) => {
      if (statsData?.success) setStats(statsData.data);
      if (logsData?.success) setRecentLogs(logsData.data || []);
      if (alertsData?.success) setAlerts(alertsData.data || []);
    }).catch(err => {
      console.error('Dashboard data fetch error:', err);
    }).finally(() => setIsLoading(false));
  }, [period]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (!stats && isLoading) return <div className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>;
  if (!stats) return <div className="py-20 text-center text-gray-400 italic">Failed to load dashboard statistics. Please check your connection.</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Shopify Command Center</h2>
          <p className="text-sm text-gray-500">Real-time omnichannel performance monitoring</p>
        </div>
        <div className="flex items-center gap-2 p-1 bg-white border border-gray-100 rounded-xl shadow-sm">
          {['today', '7d', '30d', 'ytd'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                period === p 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Today Revenue', value: stats?.todayRevenue ? `$${Number(stats.todayRevenue).toLocaleString()}` : '$0', icon: BarChart3, color: 'emerald', trend: '+12.4%' },
          { label: 'Net Sales', value: stats?.netSales ? `$${Number(stats.netSales).toLocaleString()}` : '$0', icon: CheckCircle2, color: 'blue', trend: '+10.2%' },
          { label: 'Total Orders', value: stats?.totalOrders || '0', icon: ShoppingBag, color: 'purple', trend: '+8.5%' },
          { label: 'Avg Order Value', value: stats?.aov ? `$${Number(stats.aov).toFixed(2)}` : '$0', icon: ShoppingCart, color: 'amber', trend: '+3.6%' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm" data-testid={`shopify-kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${kpi.color}-50 text-${kpi.color}-600`}>
                <kpi.icon size={20} />
              </div>
              <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">{kpi.trend}</span>
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{kpi.label}</p>
            <p className="text-3xl font-black text-gray-900 tracking-tight" data-testid="kpi-value">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Sales by Channel */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Store size={14} className="text-blue-500" />
            Banners
          </h3>
          <div className="space-y-4">
            {stats?.salesByChannel?.map((chan: any) => (
              <div key={chan.name}>
                <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold uppercase tracking-tighter">
                  <span className="text-gray-600">{chan.name}</span>
                  <span className="text-gray-900">${chan.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-1000" 
                    style={{ width: `${stats.salesByChannel && stats.salesByChannel[0] ? (chan.value / stats.salesByChannel[0].value) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Mix (Online vs POS) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity size={14} className="text-indigo-500" />
            Channel Mix
          </h3>
          <div className="space-y-6">
            {stats?.revenueSplit?.map((s: any) => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-gray-900 uppercase">{s.name}</span>
                  <span className="text-xs font-black text-gray-900">${s.value.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${stats.todayRevenue > 0 ? (s.value / stats.todayRevenue) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[9px] font-bold text-gray-400">{stats.todayRevenue > 0 ? Math.round((s.value / stats.todayRevenue) * 100) : 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Categories */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Package size={14} className="text-purple-500" />
            Categories
          </h3>
          <div className="space-y-4">
            {stats?.salesByCategory?.map((cat: any) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold uppercase tracking-tighter">
                  <span className="text-gray-600">{cat.name}</span>
                  <span className="text-gray-900">${cat.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all duration-1000" 
                    style={{ width: `${stats.salesByCategory && stats.salesByCategory[0] ? (cat.value / stats.salesByCategory[0].value) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Alerts Widget */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle size={14} className="text-rose-500" />
              Alerts
            </h3>
            <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{alerts.length} Critical</span>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-black ${
                    alert.type === 'OUT_OF_STOCK' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {alert.type === 'OUT_OF_STOCK' ? 'OS' : 'LS'}
                  </div>
                  <span className="text-[10px] font-black text-gray-900 uppercase">{alert.styleId}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-400">{alert.current}u</span>
              </div>
            ))}
          </div>
          <button className="w-full mt-4 py-2 text-[9px] font-black text-purple-600 uppercase tracking-widest hover:bg-purple-50 rounded-lg transition-colors">
            View All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Order Pipeline */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart size={14} className="text-purple-500" />
              Order Pipeline
            </h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Live Funnel</span>
          </div>
          
          <div className="space-y-6">
            {[
              { label: 'New Orders', count: stats?.pendingOrders || 0, color: 'bg-amber-400', width: '100%', icon: Sparkles },
              { label: 'In Picking', count: 12, color: 'bg-blue-400', width: '75%', icon: Warehouse },
              { label: 'Shipped Today', count: 84, color: 'bg-emerald-400', width: '50%', icon: Package },
            ].map((step, i) => (
              <div key={i} className="relative group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <step.icon size={12} className="text-gray-400" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-tight">{step.label}</span>
                  </div>
                  <span className="text-sm font-black text-gray-900">{step.count}</span>
                </div>
                <div className="h-4 bg-gray-50 rounded-full overflow-hidden flex shadow-inner border border-gray-100">
                  <div 
                    className={`h-full ${step.color} transition-all duration-1000 ease-out flex items-center justify-end px-2 group-hover:brightness-110 shadow-sm`}
                    style={{ width: step.width }}
                  >
                    <div className="w-1 h-1 bg-white/40 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[9px] text-gray-400 font-bold uppercase text-center leading-relaxed">
            Avg. processing time: <span className="text-purple-600">4.2 hours</span> from creation to ship
          </p>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <Activity size={14} className="text-emerald-500" />
              Recent Sync Events
            </h3>
            <StatusBadge status="synced" label="Operational" />
          </div>
          
          <div className="space-y-4">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4 italic">No recent sync events</p>
            ) : recentLogs.map(log => (
              <div key={log.LOG_ID} className="flex items-center justify-between group cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-xl transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${
                    log.STATUS === 'SUCCESS' || log.STATUS === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {log.ENTITY_TYPE[0]}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-900 uppercase">
                      {log.ACTION_TYPE} {log.ENTITY_TYPE.toLowerCase()} <span className="text-gray-400 font-bold ml-1">#{log.ENTITY_ID}</span>
                    </p>
                    <p className="text-[9px] text-gray-400 font-medium tabular-nums mt-0.5">{new Date(log.CREATED_AT).toLocaleString()}</p>
                  </div>
                </div>
                <ArrowRight size={12} className="text-gray-200 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ANALYTICS
// ============================================================================

const ShopifyAnalytics: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'revenue' | 'performance' | 'returns'>('revenue');
  const [data, setData] = useState<any>(null);
  const [perfData, setPerfData] = useState<any>(null);
  const [returnData, setReturnData] = useState<any>(null);
  const [period, setPeriod] = useState('7d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const endpoints = {
      revenue: `/shopify/analytics/revenue?period=${period}`,
      performance: `/shopify/analytics/fulfillment?period=${period}`,
      returns: `/shopify/analytics/returns?period=${period}`
    };

    fetch(`${API_BASE_URL}${endpoints[activeSubTab]}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          if (activeSubTab === 'revenue') setData(d.data);
          else if (activeSubTab === 'performance') setPerfData(d.data);
          else if (activeSubTab === 'returns') setReturnData(d.data);
        }
      })
      .finally(() => setIsLoading(false));
  }, [period, activeSubTab]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Analytics Command Center</h3>
            <p className="text-sm text-gray-500 mt-1">Cross-channel intelligence and performance metrics</p>
          </div>
          
          <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-xl">
            {(['revenue', 'performance', 'returns'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveSubTab(t)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSubTab === t 
                    ? 'bg-white text-purple-600 shadow-sm' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 p-1 bg-white border border-gray-100 rounded-xl shadow-sm">
          {['today', '7d', '30d', 'ytd'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                period === p 
                  ? 'bg-purple-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>
      ) : activeSubTab === 'revenue' && data ? (
        <>
          {/* Revenue Analytics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gross Sales</p>
              <p className="text-3xl font-black text-gray-900">${data?.grossSales.toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">{data?.trends.revenue}</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">vs previous {period}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Net Sales</p>
              <p className="text-3xl font-black text-gray-900">${data?.netSales.toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold italic">
                After ${data?.refunds.toLocaleString()} estimated refunds
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Orders</p>
              <p className="text-3xl font-black text-gray-900">{data?.orders.toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">{data?.trends.orders}</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Order Volume</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
              <BarChart3 size={14} className="text-purple-500" />
              Revenue Over Time
            </h4>
            <div className="h-64 flex items-end gap-2 px-4">
              {data?.chartData.map((d: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full bg-gray-50 rounded-t-lg relative flex items-end overflow-hidden h-48">
                    <div 
                      className="w-full bg-purple-500/80 group-hover:bg-purple-600 transition-all duration-500 rounded-t-sm"
                      style={{ height: `${(d.revenue / (Math.max(...data.chartData.map((x: any) => x.revenue)) || 1)) * 100}%` }}
                    >
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] font-black px-2 py-1 rounded whitespace-nowrap transition-opacity">
                        ${d.revenue.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : activeSubTab === 'performance' && perfData ? (
        <>
          {/* Performance Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Avg. Time to Ship</p>
              <p className="text-3xl font-black text-gray-900">{perfData?.avgTimeToShip}h</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">-1.2h</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Faster than avg</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">SLA Attainment</p>
              <p className="text-3xl font-black text-gray-900">{perfData?.slaAttainment}%</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">Optimal</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Within 24h target</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pick Accuracy</p>
              <p className="text-3xl font-black text-gray-900">{perfData?.pickAccuracy}%</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-black text-purple-500 bg-purple-50 px-2 py-0.5 rounded">High</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Low error rate</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Activity size={14} className="text-emerald-500" />
                Carrier Performance
              </h4>
              <div className="space-y-6">
                {perfData?.carrierPerformance.map((c: any) => (
                  <div key={c.name}>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-black text-gray-900 uppercase">{c.name}</span>
                      <span className="text-[10px] font-bold text-gray-400">{c.shipments.toLocaleString()} Shipments</span>
                    </div>
                    <div className="h-2 bg-gray-50 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${c.onTime}%` }} />
                    </div>
                    <p className="mt-1 text-[9px] font-bold text-emerald-600 uppercase tracking-tight">{c.onTime}% On-Time</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Clock size={14} className="text-purple-500" />
                SLA Fulfillment Trend
              </h4>
              <div className="h-64 flex items-end gap-2">
                {perfData?.dailySLA.map((d: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full bg-purple-50 rounded-t-lg group-hover:bg-purple-100 transition-colors relative" style={{ height: `${d.percentage}%` }}>
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-xl">
                        {d.percentage.toFixed(1)}% SLA
                      </div>
                    </div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : activeSubTab === 'returns' && returnData ? (
        <>
          {/* Returns Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Return Rate</p>
              <p className="text-3xl font-black text-gray-900">{returnData?.returnRate}%</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded">+0.4%</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">vs previous {period}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Returns</p>
              <p className="text-3xl font-black text-gray-900">{returnData?.returnTrend.reduce((acc: number, t: any) => acc + t.returns, 0)}</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                Integrated VisionSuite RMA Flow
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                <AlertCircle size={14} className="text-rose-500" />
                Returns by Reason
              </h4>
              <div className="space-y-6">
                {returnData?.returnsByReason.map((r: any) => (
                  <div key={r.name}>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-black text-gray-900 uppercase">{r.name}</span>
                      <span className="text-[10px] font-bold text-gray-400">{r.count} Returns</span>
                    </div>
                    <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${(r.count / (returnData.returnsByReason[0].count || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Activity size={14} className="text-rose-500" />
                Returns Trend
              </h4>
              <div className="h-64 flex items-end gap-2">
                {returnData?.returnTrend.map((d: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full bg-rose-50 rounded-t-lg group-hover:bg-rose-100 transition-colors relative" style={{ height: `${(d.returns / 100) * 100}%` }}>
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-xl">
                        {d.returns} Returns
                      </div>
                    </div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : !isLoading && (
        <div className="py-20 text-center text-gray-400 italic">No data available for this period.</div>
      )}
    </div>
  );
};

// ============================================================================
// STORES
// ============================================================================

const ShopifyStores: React.FC = () => {
  const [stores, setStores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [isDeletingProducts, setIsDeletingProducts] = useState<string | null>(null);
  const [showHealthDashboard, setShowHealthDashboard] = useState<string | null>(null);

  // Helper to get the proper storefront URL
  const getStorefrontUrl = (store: any): string => {
    const JESTA_DEMO_STORE = 'https://jesta-demo.myshopify.com';
    
    // For ANY demo store, redirect to the real Jesta demo store
    const isDemo = store.isDemo || 
                   store.bannerId?.toLowerCase().includes('demo') ||
                   store.description?.toLowerCase().includes('demo') ||
                   store.url?.toLowerCase().includes('demo.myshopify');
    
    if (isDemo) {
      return JESTA_DEMO_STORE;
    }
    
    // If URL already has protocol, use as-is
    if (store.url?.startsWith('http://') || store.url?.startsWith('https://')) {
      return store.url;
    }
    
    // Otherwise, prepend https://
    return store.url ? `https://${store.url}` : '#';
  };

  const fetchStores = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/shopify/stores`)
      .then(r => r.json())
      .then(d => { if (d.success) setStores(d.data || []); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchStores(); }, []);

  const handleTestConnection = async (bannerId: string) => {
    setTestingConnection(bannerId);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data.success) {
        const details = data.data.details;
        alert(
          `✅ Connection Successful!\n\n` +
          `Shop: ${details.shop}\n` +
          `Domain: ${details.domain}\n` +
          `Email: ${details.email}\n` +
          `Currency: ${details.currency}\n` +
          `Country: ${details.country}\n` +
          `Plan: ${details.plan}`
        );
      } else {
        alert(`❌ Connection Failed: ${data.data?.message || data.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      alert('Network error testing connection');
    }
    setTestingConnection(null);
  };

  const handleDeleteAllProducts = async (bannerId: string) => {
    setIsDeletingProducts(bannerId);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/products`, { method: 'DELETE' });
      const data = await res.json();
      alert(data.message || `Deleted ${data.data?.deletedCount || 0} products`);
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setIsDeletingProducts(null);
    setShowDeleteModal(null);
  };

  // Quick actions for the stores page
  const quickActions = [
    {
      id: 'add-store',
      label: 'Connect New Store',
      description: 'Link a new Shopify store to VisionSuite',
      icon: <Plus size={18} className="text-white" />,
      color: 'bg-gradient-to-br from-purple-500 to-indigo-600',
      onClick: () => setShowAddModal(true)
    },
    {
      id: 'sync-all',
      label: 'Full Catalog Sync',
      description: 'Push all VisionSuite products to Shopify',
      icon: <RefreshCw size={18} className="text-white" />,
      color: 'bg-gradient-to-br from-blue-500 to-cyan-600',
      onClick: () => alert('Full sync initiated (demo)')
    },
    {
      id: 'bulk-publish',
      label: 'Bulk Publish',
      description: 'Publish multiple styles at once',
      icon: <Upload size={18} className="text-white" />,
      color: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      onClick: () => alert('Use Products tab → Quick Publish')
    },
    {
      id: 'view-api',
      label: 'API Documentation',
      description: 'View Shopify integration API docs',
      icon: <ExternalLink size={18} className="text-white" />,
      color: 'bg-gradient-to-br from-gray-600 to-gray-800',
      onClick: () => window.open('https://shopify.dev/docs/api/admin-graphql', '_blank')
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Quick Actions Panel */}
      <QuickActionsPanel 
        actions={quickActions}
        title="Store Management"
        subtitle="Connect channels and manage integrations"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Connected Stores</h3>
          <p className="text-sm text-gray-500 mt-1">{stores.length} active channel{stores.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchStores}>Refresh</Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddModal(true)}>Add Store</Button>
        </div>
      </div>

      {/* Store Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="stores-grid">
        {isLoading ? (
          <div className="col-span-full py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>
        ) : stores.length === 0 ? (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 flex items-center justify-center">
              <Store size={32} className="text-purple-400" />
            </div>
            <p className="text-gray-500">No stores connected yet</p>
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setShowAddModal(true)}>
              Connect Your First Store
            </Button>
          </div>
        ) : stores.map(store => (
          <div key={store.bannerId} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:border-purple-100 transition-all group" data-testid="store-card">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all group-hover:scale-110 ${
                  store.isDemo ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-purple-50 text-purple-600 border border-purple-100'
                }`}>
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{store.description}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">{store.bannerId}</p>
                    {store.isDemo && (
                      <span className="text-[8px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase">Demo</span>
                    )}
                  </div>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                store.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${store.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                {store.isActive ? 'Active' : 'Disabled'}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ExternalLink size={12} />
                <span className="truncate">{store.url}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <RefreshCw size={12} />
                <span>Last Sync: 2 minutes ago</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="xs" 
                icon={<ExternalLink size={12} />}
                onClick={() => window.open(getStorefrontUrl(store), '_blank')}
              >
                View Store
              </Button>
              <Button 
                variant="outline" 
                size="xs"
                icon={<Activity size={12} />}
                onClick={() => setShowHealthDashboard(store.bannerId)}
                className="bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-green-200"
              >
                Health
              </Button>
              <Button 
                variant="outline" 
                size="xs"
                icon={<RefreshCw size={12} />}
                isLoading={testingConnection === store.bannerId}
                onClick={() => handleTestConnection(store.bannerId)}
                data-testid="test-connection-btn"
              >
                Test API
              </Button>
              <Button 
                variant="danger" 
                size="xs" 
                icon={<Trash2 size={12} />}
                onClick={() => setShowDeleteModal(store.bannerId)}
                title="Delete all products"
              >
                Clear
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      <AddStoreModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchStores}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal !== null}
        onClose={() => setShowDeleteModal(null)}
        onConfirm={() => handleDeleteAllProducts(showDeleteModal!)}
        title="Delete All Products?"
        description="This will permanently remove all products from this Shopify store. VisionSuite data will not be affected."
        confirmText="Delete All Products"
      />

      {/* Health Dashboard Modal */}
      {showHealthDashboard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl my-8 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Activity className="text-green-600" size={24} />
                  Store Health Dashboard
                </h3>
                <p className="text-sm text-gray-600 mt-1">Real-time monitoring from VisionSuite SSOT</p>
              </div>
              <button
                onClick={() => setShowHealthDashboard(null)}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-y-auto">
              <StoreHealthDashboard 
                bannerId={showHealthDashboard} 
                onClose={() => setShowHealthDashboard(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// QUICK PUBLISH WIZARD
// ============================================================================

const QuickPublishWizard: React.FC<{ isOpen: boolean; onClose: () => void; onComplete: () => void }> = ({ isOpen, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  const [selectedStyles, setSelectedStyles] = useState<any[]>([]);
  const [selectedBanner, setSelectedBanner] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [styles, setStyles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch(`${API_BASE_URL}/shopify/products?limit=50&status=not_published`)
        .then(r => r.json())
        .then(d => { if (d.success) setStyles(d.data || []); })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await Promise.all(selectedStyles.map(s => 
        fetch(`${API_BASE_URL}/shopify/products/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            business_unit_id: 1, 
            style_id: s.styleId, 
            banner_id: selectedBanner, 
            publish: true 
          })
        })
      ));
      onComplete();
      onClose();
    } catch (e) {}
    setIsPublishing(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Quick Publish Wizard</h3>
            <p className="text-sm text-gray-500">Step {step} of 3: {step === 1 ? 'Select Products' : step === 2 ? 'Choose Channel' : 'Confirm & Publish'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors" data-testid="wizard-close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Select styles to publish</p>
              {isLoading ? (
                <div className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {styles.map(s => (
                    <button
                      key={s.styleId}
                      onClick={() => setSelectedStyles(prev => 
                        prev.find(x => x.styleId === s.styleId) ? prev.filter(x => x.styleId !== s.styleId) : [...prev, s]
                      )}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedStyles.find(x => x.styleId === s.styleId) 
                          ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-100' 
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-black text-gray-900">{s.styleId}</p>
                        <p className="text-[10px] text-gray-400 font-medium truncate w-32">{s.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Select Target Channel</p>
              <div className="grid grid-cols-1 gap-4">
                {['JESTA'].map(b => (
                  <button
                    key={b}
                    onClick={() => setSelectedBanner(b)}
                    className={`flex items-center justify-between p-6 rounded-2xl border transition-all ${
                      selectedBanner === b 
                        ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100' 
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shadow-sm">
                        <Store size={24} className="text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-gray-900">{b}</p>
                        <p className="text-xs text-gray-500 font-medium">Shopify Online Store</p>
                      </div>
                    </div>
                    {selectedBanner === b && <CheckCircle2 className="text-purple-600" size={24} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 text-center py-10">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package size={40} />
              </div>
              <div>
                <h4 className="text-lg font-black text-gray-900 tracking-tight">Ready to Sync</h4>
                <p className="text-sm text-gray-500 mt-2">
                  You are about to publish <span className="font-bold text-gray-900">{selectedStyles.length} styles</span> to <span className="font-bold text-purple-600">{selectedBanner}</span>.
                </p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 max-w-sm mx-auto">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-500 font-bold uppercase">Estimated Variants</span>
                  <span className="font-black text-gray-900">{selectedStyles.reduce((acc, s) => acc + s.variantCount, 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-bold uppercase">Inventory Sync</span>
                  <span className="font-black text-emerald-600 uppercase">Enabled</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            disabled={isPublishing}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-3">
            {step < 3 ? (
              <Button 
                variant="primary" 
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? selectedStyles.length === 0 : !selectedBanner}
                icon={<ChevronRight size={14} />}
              >
                Continue
              </Button>
            ) : (
              <Button 
                variant="primary" 
                onClick={handlePublish}
                isLoading={isPublishing}
                icon={<Sparkles size={14} />}
              >
                Publish Now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PRODUCTS
// ============================================================================

const ShopifyProducts: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedBanner, setSelectedBanner] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeActions, setActiveActions] = useState<string | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [liveProducts, setLiveProducts] = useState<any[]>([]);
  const [showLiveProducts, setShowLiveProducts] = useState(false);
  const [productView, setProductView] = useState<'synced' | 'publisher'>('publisher');

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/stores`)
      .then(r => r.json())
      .then(d => { if (d.success) setStores(d.data || []); })
      .catch(err => console.error('Stores fetch error:', err));
  }, []);

  const fetchProducts = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams({
      limit: '25',
      ...(selectedBanner && { banner_id: selectedBanner }),
      ...(search && { search })
    });
    fetch(`${API_BASE_URL}/shopify/products?${params}`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) {
          const productData = Array.isArray(d.data) ? d.data : (d.data?.products || []);
          setProducts(productData); 
        }
      })
      .catch(err => console.error('Products fetch error:', err))
      .finally(() => setIsLoading(false));
  }, [selectedBanner, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleToggleStatus = async (styleId: string, bannerId: string, publish: boolean) => {
    setActiveActions(styleId);
    try {
      await fetch(`${API_BASE_URL}/shopify/products/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_unit_id: 1, style_id: styleId, banner_id: bannerId, publish })
      });
      fetchProducts();
    } catch (e) {}
    setActiveActions(null);
  };

  const handleSyncInventory = async (styleId: string, bannerId: string) => {
    setActiveActions(styleId);
    try {
      await fetch(`${API_BASE_URL}/shopify/products/sync-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_unit_id: 1, style_id: styleId, banner_id: bannerId })
      });
    } catch (e) {}
    setActiveActions(null);
  };

  const handleSyncMedia = async (styleId: string, bannerId: string) => {
    setActiveActions(`${styleId}-media`);
    try {
      await fetch(`${API_BASE_URL}/shopify/products/sync-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_unit_id: 1, style_id: styleId, banner_id: bannerId })
      });
      alert('Media sync initiated. Check logs for progress.');
    } catch (e) {}
    setActiveActions(null);
  };

  const toggleStyleSelection = (styleId: string) => {
    setSelectedStyles(prev => 
      prev.includes(styleId) ? prev.filter(s => s !== styleId) : [...prev, styleId]
    );
  };

  const handleBulkAction = async (action: 'publish' | 'unpublish' | 'sync') => {
    if (selectedStyles.length === 0) return;
    setActiveActions('bulk');
    try {
      // In a real app, this would be a single bulk endpoint. 
      // For demo, we just process one by one or mock success.
      await Promise.all(selectedStyles.map(styleId => {
        const product = products.find(p => p.styleId === styleId);
        if (!product) return Promise.resolve();
        
        if (action === 'sync') {
          return fetch(`${API_BASE_URL}/shopify/products/sync-inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_unit_id: 1, style_id: styleId, banner_id: product.bannerId })
          });
        } else {
          return fetch(`${API_BASE_URL}/shopify/products/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              business_unit_id: 1, 
              style_id: styleId, 
              banner_id: product.bannerId, 
              publish: action === 'publish' 
            })
          });
        }
      }));
      fetchProducts();
      setSelectedStyles([]);
    } catch (e) {}
    setActiveActions(null);
  };

  // Fetch live products from Shopify
  const fetchLiveProducts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/products/live?limit=50`);
      const data = await res.json();
      if (data.success) setLiveProducts(data.data || []);
    } catch (e) {}
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* View Toggle - Tab Switcher */}
      <div className="flex items-center justify-between">
        <div className="bg-white rounded-2xl p-1.5 inline-flex shadow-sm border border-gray-100">
          <button
            onClick={() => setProductView('publisher')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              productView === 'publisher'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Store size={16} />
            Scope Publisher
          </button>
          <button
            onClick={() => setProductView('synced')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              productView === 'synced'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Package size={16} />
            Synced Products
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Direct Create
          </button>
          <button
            onClick={() => { setShowLiveProducts(!showLiveProducts); if (!showLiveProducts) fetchLiveProducts(); }}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
              showLiveProducts
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            <ExternalLink size={16} />
            {showLiveProducts ? 'Hide Live' : 'View Live'}
          </button>
        </div>
      </div>

      {/* VisionSuite Scope Publisher View (NEW - SSOT Method with Attribute Manager UX) */}
      {productView === 'publisher' && (
        <ShopifyScopePublisher 
          onPublishComplete={() => {
            fetchProducts();
            fetchLiveProducts();
          }}
        />
      )}

      {/* Synced Products View (Original) */}
      {productView === 'synced' && (
        <>
          {/* Quick Actions */}
          <div className="grid grid-cols-4 gap-4">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="group flex items-center gap-4 p-5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl text-white shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-300 transition-all hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <div className="text-left">
                <p className="font-black tracking-tight">Create Product</p>
                <p className="text-emerald-100 text-xs">Publish directly to Shopify</p>
              </div>
            </button>

            <button
              onClick={() => setProductView('publisher')}
              className="group flex items-center gap-4 p-5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl text-white shadow-lg shadow-purple-200 hover:shadow-xl hover:shadow-purple-300 transition-all hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles size={24} />
              </div>
              <div className="text-left">
                <p className="font-black tracking-tight">Bulk Publisher</p>
                <p className="text-purple-100 text-xs">VisionSuite SSOT flow</p>
              </div>
            </button>

            <button
              onClick={() => { setShowLiveProducts(!showLiveProducts); if (!showLiveProducts) fetchLiveProducts(); }}
              className={`group flex items-center gap-4 p-5 rounded-2xl transition-all hover:-translate-y-1 ${
                showLiveProducts 
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-200' 
                  : 'bg-white border-2 border-dashed border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                showLiveProducts ? 'bg-white/20 backdrop-blur' : 'bg-blue-50'
              }`}>
                <Store size={24} />
              </div>
              <div className="text-left">
                <p className="font-black tracking-tight">{showLiveProducts ? 'Viewing Live' : 'View Live Store'}</p>
                <p className={`text-xs ${showLiveProducts ? 'text-blue-100' : 'text-gray-400'}`}>Products in Shopify</p>
              </div>
            </button>

            <button
              onClick={() => alert('Full sync initiated (demo)')}
              className="group flex items-center gap-4 p-5 bg-white border-2 border-dashed border-gray-200 rounded-2xl text-gray-600 hover:border-amber-300 hover:text-amber-600 transition-all hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <RefreshCw size={24} />
              </div>
              <div className="text-left">
                <p className="font-black tracking-tight">Full Inventory Sync</p>
                <p className="text-gray-400 text-xs">Push all to Shopify</p>
              </div>
            </button>
          </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Product Publisher</h3>
          <p className="text-sm text-gray-500 mt-1">Control style availability on Shopify channels</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedStyles.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-xl border border-purple-100 animate-in slide-in-from-right shadow-sm">
              <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">{selectedStyles.length} Selected</span>
              <div className="h-4 w-[1px] bg-purple-200 mx-1" />
              <button onClick={() => handleBulkAction('publish')} className="text-[10px] font-bold text-purple-700 hover:text-purple-900 uppercase px-2 py-0.5 hover:bg-purple-100 rounded transition-colors">Publish</button>
              <button onClick={() => handleBulkAction('sync')} className="text-[10px] font-bold text-purple-700 hover:text-purple-900 uppercase px-2 py-0.5 hover:bg-purple-100 rounded transition-colors">Sync Inv</button>
              <button onClick={() => handleBulkAction('unpublish')} className="text-[10px] font-bold text-rose-600 hover:text-rose-800 uppercase px-2 py-0.5 hover:bg-rose-100 rounded transition-colors">Unpublish</button>
              <button onClick={() => setSelectedStyles([])} className="ml-1 text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"><X size={12} /></button>
            </div>
          )}
          <select 
            className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:border-purple-400 outline-none"
            value={selectedBanner}
            onChange={e => setSelectedBanner(e.target.value)}
          >
            <option value="">All Channels</option>
            {stores.map(s => <option key={s.bannerId} value={s.bannerId}>{s.bannerId}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search SKU..." 
              className="h-9 pl-9 pr-3 w-48 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-purple-400"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchProducts}>Refresh</Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-6 py-4 text-left w-10">
                <input 
                  type="checkbox" 
                  checked={products.length > 0 && selectedStyles.length === products.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedStyles(products.map(p => p.styleId));
                    else setSelectedStyles([]);
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
              </th>
              <th className="px-6 py-4 text-left">Style ID</th>
              <th className="px-6 py-4 text-left">Banner</th>
              <th className="px-6 py-4 text-center">Variants</th>
              <th className="px-6 py-4 text-center">Inventory</th>
              <th className="px-6 py-4 text-center">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={7} className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="py-20 text-center text-gray-400">No synced products found</td></tr>
            ) : products.map(product => (
              <tr key={`${product.styleId}-${product.bannerId}`} className={`hover:bg-gray-50/50 transition-colors ${selectedStyles.includes(product.styleId) ? 'bg-purple-50/30' : ''}`} data-testid="product-row">
                <td className="px-6 py-4">
                  <input 
                    type="checkbox" 
                    checked={selectedStyles.includes(product.styleId)}
                    onChange={() => toggleStyleSelection(product.styleId)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-50 flex-shrink-0" />
                    <span className="text-xs font-black text-gray-900" data-testid="product-style-id">{product.styleId}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase bg-purple-50 px-2 py-0.5 rounded" data-testid="product-banner">{product.bannerId}</span>
                </td>
                <td className="px-6 py-4 text-center text-xs text-gray-600" data-testid="product-variants">{product.variantCount}</td>
                <td className="px-6 py-4 text-center text-xs font-bold text-gray-900" data-testid="product-inventory">{product.totalInventory}</td>
                <td className="px-6 py-4 text-center" data-testid="product-status">
                  <StatusBadge 
                    status={product.shopifyProductId ? 'live' : 'not_published'} 
                  />
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {product.shopifyProductId && (
                      <>
                        <button 
                          onClick={() => window.open(`${stores.find(s => s.bannerId === product.bannerId)?.url}/admin/products/${product.shopifyProductId.split('/').pop()}`, '_blank')}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="View in Shopify"
                        >
                          <ExternalLink size={14} />
                        </button>
                        <Button 
                          variant="outline" 
                          size="xs" 
                          icon={<ImageIcon size={12} />}
                          onClick={() => handleSyncMedia(product.styleId, product.bannerId)}
                          isLoading={activeActions === `${product.styleId}-media`}
                          disabled={activeActions === 'bulk'}
                          title="Sync Media from VisionSuite"
                        >
                          Media
                        </Button>
                      </>
                    )}
                    <Button 
                      variant="outline" 
                      size="xs" 
                      onClick={() => handleSyncInventory(product.styleId, product.bannerId)}
                      disabled={(activeActions === product.styleId || activeActions === 'bulk') || !product.shopifyProductId}
                    >
                      Sync Inv
                    </Button>
                    <Button 
                      variant={product.shopifyProductId ? 'danger' : 'primary'} 
                      size="xs"
                      onClick={() => handleToggleStatus(product.styleId, product.bannerId, !product.shopifyProductId)}
                      isLoading={activeActions === product.styleId}
                      disabled={activeActions === 'bulk'}
                    >
                      {product.shopifyProductId ? 'Unpublish' : 'Publish'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Live Products View - Shown in both views */}
      {showLiveProducts && liveProducts.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 rounded-3xl border border-blue-100 p-6 animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <Store size={16} className="text-white" />
              </div>
              <div>
                <h4 className="font-black text-gray-900">Live in Shopify</h4>
                <p className="text-xs text-gray-500">{liveProducts.length} products currently active</p>
              </div>
            </div>
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={fetchLiveProducts}>Refresh</Button>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {liveProducts.slice(0, 10).map((p: any) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md transition-all group">
                <div className="aspect-square rounded-lg bg-gray-100 mb-2 overflow-hidden">
                  {p.featuredImage?.url ? (
                    <img src={p.featuredImage.url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package size={24} />
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-black text-gray-900 truncate">{p.title}</p>
                <p className="text-[9px] text-gray-400">{p.variants?.edges?.length || 1} variants</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickPublishWizard 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)} 
        onComplete={fetchProducts} 
      />

      <CreateProductModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => { fetchProducts(); fetchLiveProducts(); }}
        bannerId={selectedBanner || undefined}
      />
    </div>
  );
};

// ============================================================================
// ORDERS
// ============================================================================

const OrderDetailDrawer: React.FC<{ orderId: string; onClose: () => void }> = ({ orderId, onClose }) => {
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/orders/${orderId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setDetails(d.data); })
      .finally(() => setIsLoading(false));
  }, [orderId]);

  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100" data-testid="order-detail-drawer">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Order Details</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">SALES ORDER #{details?.order?.SALES_ORDER_ID || orderId}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="animate-spin text-purple-500" />
          </div>
        ) : details ? (
          <>
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100">
                <p className="text-[9px] font-bold text-purple-400 uppercase mb-1">Customer Profile</p>
                <p className="text-xs font-black text-purple-900 truncate">{details.order.CUSTOMER_ID}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[8px] font-black text-white bg-purple-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">VIP Tier</span>
                  <span className="text-[9px] text-purple-400 font-bold">$4,230 LTV</span>
                </div>
              </div>
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <p className="text-[9px] font-bold text-blue-400 uppercase mb-1">Order Date</p>
                <p className="text-xs font-black text-blue-900">{new Date(details.order.ORDER_DATE).toLocaleDateString()}</p>
                <div className="mt-2 text-[9px] text-blue-400 font-bold uppercase tracking-tighter">
                  8 Total Orders
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2" data-testid="order-line-items-header">
                <Package size={14} className="text-purple-500" />
                Line Items ({details.items.length})
              </h4>
              <div className="space-y-3">
                {details.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-100">
                      {item.IMAGE_URL ? (
                        <img src={`${API_BASE_URL}${item.IMAGE_URL}`} alt={item.STYLE_ID} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={20} className="text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-900 truncate">{item.STYLE_ID}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-tighter truncate">{item.COLOR_ID} / {item.SIZE_ID}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-gray-900">x{item.QTY_ORDERED}</p>
                      <p className="text-[10px] font-bold text-emerald-600">${item.UNIT_PRICE}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status & Fulfillment */}
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-gray-400 uppercase">Fulfillment Status</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                  details.order.STATUS === 'SHIPPED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {details.order.STATUS}
                </span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Site ID</span>
                  <span className="font-bold text-gray-900">{details.order.SITE_ID}</span>
                </div>
                {details.shipments && details.shipments.length > 0 ? (
                  details.shipments.map((s: any, idx: number) => (
                    <div key={idx} className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-purple-500" />
                          <span className="text-[10px] font-black text-gray-900 uppercase tracking-tight">Parcel {idx + 1}</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Shipped</span>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 font-medium text-[10px] uppercase">Carrier</span>
                          <span className="font-bold text-gray-900">{s.CARRIER_NAME}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 font-medium text-[10px] uppercase">Tracking</span>
                          <span className="font-black text-purple-600 flex items-center gap-1 cursor-pointer hover:underline tabular-nums">
                            {s.TRACKING_NUMBER}
                            <ExternalLink size={10} />
                          </span>
                        </div>
                      </div>
                      {/* Parcel Items */}
                      {s.items && s.items.length > 0 && (
                        <div className="pt-2 border-t border-gray-50">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Packed in this Parcel</p>
                          <div className="flex flex-wrap gap-1">
                            {s.items.map((si: any, sidx: number) => (
                              <div key={sidx} className="px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] font-bold text-gray-600 flex items-center gap-1">
                                <span className="text-purple-600">{si.STYLE_ID}</span>
                                <span className="text-gray-400">x{si.QTY_SHIPPED}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Carrier</span>
                    <span className="font-bold text-gray-900">{details.order.CARRIER_NAME || 'Not Assigned'}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-gray-400">Failed to load order details</div>
        )}
      </div>

      <div className="p-6 border-t border-gray-100 bg-gray-50/50">
        <Button variant="primary" className="w-full" icon={<ExternalLink size={14} />}>View in VisionSuite</Button>
      </div>
    </div>
  );
};

/**
 * Enhanced Shopify Orders Component
 * VisionSuite SSOT: Displays orders from V_ECOMM_ORDERS
 * Features: Origin filtering, search, card/table view toggle
 */
const ShopifyOrders: React.FC = () => {
  // State
  const [orders, setOrders] = useState<any[]>([]);
  const [originStats, setOriginStats] = useState({ all: 0, shopify: 0, omni: 0, edom: 0, pos: 0 });
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  // Fetch origin stats on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/orders/stats/origins`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) {
          setOriginStats(d.data);
          console.log('[ORDER STATS]', d.data);
        }
      })
      .catch(err => console.error('Origin stats fetch error:', err));
  }, []);

  // Fetch orders when filters change
  useEffect(() => {
    fetchOrders();
  }, [selectedOrigin, searchTerm]);

  const fetchOrders = () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      limit: '50',
      ...(selectedOrigin && { origin: selectedOrigin }),
      ...(searchTerm && { search: searchTerm })
    });
    
    fetch(`${API_BASE_URL}/shopify/orders?${params}`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) {
          const orderData = Array.isArray(d.data) ? d.data : (d.data?.orders || []);
          setOrders(orderData);
          console.log('[ORDERS]', orderData.length, 'orders loaded');
        }
      })
      .catch(err => console.error('Orders fetch error:', err))
      .finally(() => setIsLoading(false));
  };

  const handleExport = () => {
    const params = new URLSearchParams({
      ...(selectedOrigin && { origin: selectedOrigin }),
      ...(searchTerm && { search: searchTerm })
    });
    window.open(`${API_BASE_URL}/shopify/orders/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Orders</h3>
          <p className="text-sm text-gray-600 mt-1">
            Unified view of all orders across channels • {originStats.all.toLocaleString()} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'cards' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              data-testid="view-cards"
            >
              <Grid3x3 size={14} />
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'table' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              data-testid="view-table"
            >
              <List size={14} />
              Table
            </button>
          </div>
          
          <Button 
            variant="secondary" 
            size="sm" 
            icon={<Download size={14} />}
            onClick={handleExport}
          >
            Export CSV
          </Button>
          
          <Button 
            variant="secondary" 
            size="sm" 
            icon={<RefreshCw size={14} />}
            onClick={fetchOrders}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by order #, customer ID, WFE transaction ID..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all text-sm"
          data-testid="order-search"
        />
      </div>

      {/* Origin Filter */}
      <OrderOriginFilter 
        stats={originStats}
        selected={selectedOrigin}
        onChange={setSelectedOrigin}
      />

      {/* Order List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-purple-500" size={32} />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 font-medium">No orders found</p>
          <p className="text-sm text-gray-400 mt-1">
            {selectedOrigin 
              ? `No orders from ${selectedOrigin}${searchTerm ? ` matching "${searchTerm}"` : ''}` 
              : searchTerm 
                ? `No orders matching "${searchTerm}"`
                : 'Try adjusting your filters'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="orders-grid">
          {orders.map(order => (
            <OrderCard 
              key={order.orderId}
              order={order}
              onClick={() => setSelectedOrder(order.orderId.toString())}
            />
          ))}
        </div>
      ) : (
        // Table View (original implementation)
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm" data-testid="orders-table">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-4 text-left">Order #</th>
                <th className="px-6 py-4 text-left">Customer</th>
                <th className="px-6 py-4 text-left">Date</th>
                <th className="px-6 py-4 text-left">Site</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => (
                <tr 
                  key={order.orderId} 
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer" 
                  onClick={() => setSelectedOrder(order.orderId.toString())}
                  data-testid="order-row"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-gray-900" data-testid="order-id">#{order.wfeTransId || order.orderId}</span>
                      <span className="text-[9px] text-gray-400 uppercase tracking-tighter" data-testid="order-origin">{order.origin}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600" data-testid="order-customer">{order.customerId || 'N/A'}</td>
                  <td className="px-6 py-4 text-xs text-gray-500" data-testid="order-date">{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-xs font-bold text-gray-700" data-testid="order-site">{order.siteId || 'N/A'}</td>
                  <td className="px-6 py-4 text-center" data-testid="order-status">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                      order.status?.includes('SHIP') ? 'bg-emerald-50 text-emerald-700' :
                      order.status?.includes('PICK') ? 'bg-blue-50 text-blue-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {order.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Detail Drawer */}
      {selectedOrder && (
        <OrderDetailDrawer 
          orderId={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
        />
      )}
    </div>
  );
};

// ============================================================================
// JOBS
// ============================================================================

const ShopifyJobs: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/shopify/jobs`)
      .then(r => r.json())
      .then(d => { if (d.success) setJobs(d.data || []); })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleRunJob = async (name: string) => {
    try {
      await fetch(`${API_BASE_URL}/shopify/jobs/${name}/run`, { method: 'POST' });
      fetchJobs();
    } catch (e) {}
  };

  const handleToggleJob = async (name: string, currentState: string) => {
    try {
      const enable = currentState === 'DISABLED' || currentState === 'BROKEN';
      await fetch(`${API_BASE_URL}/shopify/jobs/${name}/toggle`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable })
      });
      fetchJobs();
    } catch (e) {}
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Scheduler Control</h3>
        <p className="text-sm text-gray-500 mt-1">Monitor and trigger VisionSuite Shopify jobs</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>
        ) : jobs.map(job => (
          <div key={job.JOB_NAME} className="p-6 flex items-center justify-between hover:bg-gray-50/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                job.STATE === 'RUNNING' ? 'bg-blue-50 text-blue-600 animate-pulse' : 'bg-gray-50 text-gray-400'
              }`}>
                <Clock size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{job.JOB_NAME}</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{job.REPEAT_INTERVAL}</p>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-right">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Last Run</p>
                <p className="text-xs font-medium text-gray-600">{job.LAST_START_DATE ? new Date(job.LAST_START_DATE).toLocaleTimeString() : 'Never'}</p>
              </div>
              <div className="text-right min-w-[100px]">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Next Run</p>
                <p className="text-xs font-medium text-gray-600">{job.NEXT_RUN_DATE ? new Date(job.NEXT_RUN_DATE).toLocaleTimeString() : 'Paused'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="xs" 
                  icon={<Play size={12} />}
                  onClick={() => handleRunJob(job.JOB_NAME)}
                >Run Now</Button>
                <button 
                  onClick={() => handleToggleJob(job.JOB_NAME, job.STATE)}
                  className={`p-2 rounded-lg transition-colors ${
                    job.STATE === 'DISABLED' ? 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50' : 'text-emerald-500 hover:text-rose-500 hover:bg-rose-50'
                  }`}
                  title={job.STATE === 'DISABLED' ? 'Enable Job' : 'Disable Job'}
                  data-testid="job-toggle-btn"
                >
                  <Power size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SYNC LOGS
// ============================================================================

const LogDetailDrawer: React.FC<{ logId: number; onClose: () => void }> = ({ logId, onClose }) => {
  const [log, setLog] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/logs/${logId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLog(d.data); })
      .finally(() => setIsLoading(false));
  }, [logId]);

  const formatJson = (val: string | null) => {
    if (!val) return 'None';
    try {
      const parsed = JSON.parse(val);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return val;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Sync Event Details</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">LOG ID #{logId}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="animate-spin text-purple-500" />
          </div>
        ) : log ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Entity</p>
                <p className="text-xs font-black text-gray-900">{log.ENTITY_TYPE}: {log.ENTITY_ID}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Status</p>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                  log.STATUS === 'SUCCESS' || log.STATUS === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {log.STATUS}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Request Payload</h4>
                <pre className="p-4 bg-gray-900 text-purple-300 rounded-xl text-[10px] font-mono overflow-x-auto max-h-[200px]">
                  {formatJson(log.REQUEST_PAYLOAD)}
                </pre>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Response Payload</h4>
                <pre className="p-4 bg-gray-900 text-emerald-300 rounded-xl text-[10px] font-mono overflow-x-auto max-h-[200px]">
                  {formatJson(log.RESPONSE_PAYLOAD)}
                </pre>
              </div>
              {log.ERROR_MESSAGE && (
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-rose-500">Error Details</h4>
                  <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-[10px] font-bold border border-rose-100">
                    {log.ERROR_MESSAGE}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-gray-400">Log detail not found</div>
        )}
      </div>
    </div>
  );
};

const ShopifySyncLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  const fetchLogs = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/shopify/logs?limit=50`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) {
          const logData = Array.isArray(d.data) ? d.data : (d.data?.logs || []);
          setLogs(logData); 
        }
      })
      .catch(err => console.error('Logs fetch error:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Shopify Sync Logs</h3>
          <p className="text-sm text-gray-500 mt-1">Audit trail of all communication between FarsightIQ and Shopify</p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchLogs}>Refresh</Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-6 py-4 text-left">Timestamp</th>
              <th className="px-6 py-4 text-left">Entity</th>
              <th className="px-6 py-4 text-left">Action</th>
              <th className="px-6 py-4 text-center">Status</th>
              <th className="px-6 py-4 text-center">Duration</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="py-20 text-center text-gray-400">No sync logs found</td></tr>
            ) : logs.map(log => (
              <tr key={log.LOG_ID} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedLogId(log.LOG_ID)}>
                <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                  {new Date(log.CREATED_AT).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-900">{log.ENTITY_TYPE}</span>
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">{log.ENTITY_ID}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-black text-purple-600 uppercase">
                  {log.ACTION_TYPE}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    log.STATUS === 'SUCCESS' || log.STATUS === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {log.STATUS}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 tabular-nums">
                  {log.DURATION_MS ? `${log.DURATION_MS}ms` : '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="outline" size="xs">View Detail</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedLogId && (
        <LogDetailDrawer logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      )}
    </div>
  );
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const ShopifyConfig: React.FC = () => {
  const [config, setConfig] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tableExists, setTableExists] = useState(true);

  const fetchConfig = () => {
    setIsLoading(true);
    fetch(`${API_BASE_URL}/shopify/config`)
      .then(r => r.json())
      .then(d => { 
        if (d.success) {
          setConfig(d.data?.config || d.data || []); 
          setTableExists(d.data?.tableExists !== false);
        }
      })
      .catch(err => console.error('Config fetch error:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleUpdate = async (key: string, value: string) => {
    setSaving(key);
    try {
      await fetch(`${API_BASE_URL}/shopify/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      // Update local state so UI reflects the change (especially for toggles)
      setConfig(prev => prev.map(item => 
        item.CONFIG_KEY === key ? { ...item, CONFIG_VALUE: value } : item
      ));
    } catch (e) {
      console.error('Failed to update config:', e);
    }
    setSaving(null);
  };

  const demoMode = config.find(c => c.CONFIG_KEY === 'USE_DEMO_FALLBACK');
  const isDemoEnabled = demoMode?.CONFIG_VALUE === 'Y';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Hub Settings</h3>
          <p className="text-sm text-gray-500 mt-1">Manage global Shopify integration variables and AI behavior</p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchConfig}>Refresh</Button>
      </div>

      {/* DEMO MODE TOGGLE - Prominent Card */}
      <div className={`mb-6 p-6 rounded-2xl border-2 transition-all ${
        isDemoEnabled 
          ? 'bg-amber-50 border-amber-200' 
          : 'bg-emerald-50 border-emerald-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isDemoEnabled ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {isDemoEnabled ? <Sparkles size={24} /> : <Server size={24} />}
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900">
                {isDemoEnabled ? '🎭 Demo Mode Active' : '🔴 Production Mode'}
              </h4>
              <p className="text-sm text-gray-600 mt-0.5">
                {isDemoEnabled 
                  ? 'Showing sample data when real data is unavailable. Toggle OFF to show only real Oracle/Shopify data.'
                  : 'Showing ONLY real data from Oracle database and Shopify API. No mock data.'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDemoEnabled ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isDemoEnabled ? 'Demo' : 'Live'}
            </span>
            <button
              onClick={() => handleUpdate('USE_DEMO_FALLBACK', isDemoEnabled ? 'N' : 'Y')}
              disabled={saving === 'USE_DEMO_FALLBACK'}
              className={`w-14 h-8 rounded-full transition-all relative shadow-inner ${
                isDemoEnabled ? 'bg-amber-400' : 'bg-emerald-500'
              } ${saving === 'USE_DEMO_FALLBACK' ? 'opacity-50' : ''}`}
            >
              <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all flex items-center justify-center ${
                isDemoEnabled ? 'left-7' : 'left-1'
              }`}>
                {saving === 'USE_DEMO_FALLBACK' && <RefreshCw size={12} className="animate-spin text-gray-400" />}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Other Config Items */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></div>
        ) : config.filter(c => c.CONFIG_KEY !== 'USE_DEMO_FALLBACK').length === 0 ? (
          <div className="py-20 text-center text-gray-400 italic">No additional configuration variables</div>
        ) : config.filter(c => c.CONFIG_KEY !== 'USE_DEMO_FALLBACK').map(item => (
          <div key={item.CONFIG_KEY} className="p-6 flex items-start gap-8 hover:bg-gray-50/30 transition-colors">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-gray-900">{item.CONFIG_KEY}</h4>
              <p className="text-xs text-gray-500 mt-1">{item.DESCRIPTION}</p>
            </div>
            <div className="w-96 flex items-center gap-2">
              {['Y', 'N'].includes(item.CONFIG_VALUE) && item.IS_SENSITIVE !== 'Y' ? (
                <button
                  onClick={() => handleUpdate(item.CONFIG_KEY, item.CONFIG_VALUE === 'Y' ? 'N' : 'Y')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    item.CONFIG_VALUE === 'Y' ? 'bg-purple-600' : 'bg-gray-200'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    item.CONFIG_VALUE === 'Y' ? 'left-7' : 'left-1'
                  }`} />
                </button>
              ) : (
                <input 
                  type={item.IS_SENSITIVE === 'Y' ? 'password' : 'text'}
                  className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:border-purple-400 outline-none transition-all"
                  defaultValue={item.CONFIG_VALUE}
                  onBlur={(e) => handleUpdate(item.CONFIG_KEY, e.target.value)}
                />
              )}
              {saving === item.CONFIG_KEY && <RefreshCw size={14} className="animate-spin text-purple-500" />}
            </div>
          </div>
        ))}
      </div>

      {!tableExists && (
        <div className="mt-6 p-6 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0">
            <AlertCircle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-rose-900">Database Migration Required</h4>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              The SHOPIFY_CONFIG table does not exist. Run the database migration script to create it:
              <code className="ml-2 px-2 py-0.5 bg-rose-100 rounded text-[10px]">for-dbas/scripts/V067__shopify_hub_objects.sql</code>
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 p-6 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-gray-700">Infrastructure Notice</h4>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Changes to core API tokens or store URLs may require a restart of the background sync workers to take effect. 
            Ensure your Oracle Wallet is properly configured for any new Shopify domains.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// INVENTORY
// ============================================================================

const ShopifyInventory: React.FC = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedBanner, setSelectedBanner] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'discrepancy'>('all');

  useEffect(() => {
    fetch(`${API_BASE_URL}/shopify/stores`)
      .then(r => r.json())
      .then(d => { if (d.success) setStores(d.data || []); })
      .catch(err => console.error('Stores fetch error:', err));
  }, []);

  const fetchInventory = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams({
      business_unit_id: '1',
      ...(selectedBanner && { banner_id: selectedBanner })
    });
    fetch(`${API_BASE_URL}/shopify/inventory?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setInventory(d.data || []); })
      .catch(err => console.error('Inventory fetch error:', err))
      .finally(() => setIsLoading(false));
  }, [selectedBanner]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const handleSync = async (styleId: string, bannerId: string) => {
    setIsSyncing(`${styleId}-${bannerId}`);
    try {
      await fetch(`${API_BASE_URL}/shopify/products/sync-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_unit_id: 1, style_id: styleId, banner_id: bannerId })
      });
      // Simulate sync completion
      setInventory(prev => prev.map(item => 
        (item.styleId === styleId && item.bannerId === bannerId) 
          ? { ...item, shopifyQty: item.vsQty, discrepancy: 0 } 
          : item
      ));
    } catch (e) {}
    setIsSyncing(null);
  };

  const filtered = inventory.filter(item => {
    const matchesSearch = item.styleId.toLowerCase().includes(search.toLowerCase()) ||
                         item.barcodeId.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === 'all' || item.discrepancy !== 0;
    return matchesSearch && matchesFilter;
  });

  const discrepanciesCount = inventory.filter(item => item.discrepancy !== 0).length;
  const totalValueAtRisk = inventory.reduce((acc, item) => acc + (Math.abs(item.discrepancy) * 50), 0); // Mock value calculation

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Inventory Sync Panel */}
      <InventorySyncPanel bannerId={selectedBanner} onSyncComplete={fetchInventory} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Inventory Reconciliation</h3>
          <p className="text-sm text-gray-500 mt-1">Compare VisionSuite stock levels with live Shopify data</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:border-blue-400 outline-none"
            value={selectedBanner}
            onChange={e => setSelectedBanner(e.target.value)}
          >
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.bannerId} value={s.bannerId}>{s.bannerId}</option>)}
          </select>
          <div className="flex items-center gap-2 p-1 bg-white border border-gray-100 rounded-xl shadow-sm">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                filterType === 'all' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setFilterType('discrepancy')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                filterType === 'discrepancy' ? 'bg-rose-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Discrepancies Only
            </button>
          </div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={fetchInventory}>Refresh</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total SKU Pairs</p>
          <p className="text-2xl font-black text-gray-900">{inventory.length.toLocaleString()}</p>
        </div>
        <div className={`bg-white rounded-2xl border p-6 shadow-sm transition-colors ${discrepanciesCount > 0 ? 'border-rose-100 bg-rose-50/30' : 'border-gray-100'}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Discrepancies</p>
          <div className="flex items-center gap-3">
            <p className={`text-2xl font-black ${discrepanciesCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{discrepanciesCount}</p>
            {discrepanciesCount > 0 && <span className="text-[10px] font-black text-rose-500 bg-rose-100 px-2 py-0.5 rounded animate-pulse">ACTION REQUIRED</span>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estimated Value at Risk</p>
          <p className="text-2xl font-black text-gray-900">${totalValueAtRisk.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filter by SKU or Barcode..." 
              className="h-9 pl-9 pr-3 w-full bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-purple-400 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <select 
              className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:border-purple-400 outline-none"
              value={selectedBanner}
              onChange={e => setSelectedBanner(e.target.value)}
            >
              <option value="">All Channels</option>
              {stores.map(s => <option key={s.bannerId} value={s.bannerId}>{s.bannerId}</option>)}
            </select>
            {discrepanciesCount > 0 && (
              <Button variant="danger" size="sm" icon={<RefreshCw size={14} />}>Sync All Gaps</Button>
            )}
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50/50 border-b border-gray-100">
            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              <th className="px-6 py-4 text-left">SKU / Barcode</th>
              <th className="px-6 py-4 text-left">Banner</th>
              <th className="px-6 py-4 text-center">VisionSuite Qty</th>
              <th className="px-6 py-4 text-center">Shopify Qty</th>
              <th className="px-6 py-4 text-center">Variance</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="py-20 text-center"><RefreshCw className="animate-spin mx-auto text-purple-500" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-20 text-center text-gray-400 italic">No inventory data found matching criteria</td></tr>
            ) : filtered.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50 transition-colors" data-testid="inventory-row">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-gray-900" data-testid="inv-style-id">{item.styleId}</span>
                    <span className="text-[9px] text-gray-400 uppercase tracking-tighter tabular-nums" data-testid="inv-barcode">{item.barcodeId}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase bg-purple-50 px-2 py-0.5 rounded">{item.bannerId}</span>
                </td>
                <td className="px-6 py-4 text-center text-xs font-bold text-gray-600" data-testid="vs-qty">{item.vsQty}</td>
                <td className="px-6 py-4 text-center text-xs font-bold text-gray-900" data-testid="shopify-qty">{item.shopifyQty}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`text-xs font-black ${
                    item.discrepancy === 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`} data-testid="variance">
                    {item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {item.discrepancy !== 0 && (
                    <Button 
                      variant="primary" 
                      size="xs" 
                      icon={<RefreshCw size={12} />}
                      onClick={() => handleSync(item.styleId, item.bannerId)}
                      isLoading={isSyncing === `${item.styleId}-${item.bannerId}`}
                    >
                      Re-Sync
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
