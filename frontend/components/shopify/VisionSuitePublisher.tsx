import React, { useState, useEffect, useCallback } from 'react';
import { Search, Package, ChevronDown, Check, X, RefreshCw, ShoppingBag, ExternalLink, Filter, Loader2, ArrowUpRight, Store, Clock, AlertCircle } from 'lucide-react';

// Types
interface BannerStatus {
  flagged: boolean;
  pending: boolean;
  shopifyId: string | null;
  status: 'published' | 'pending' | 'flagged' | 'unpublished';
}

interface VisionSuiteStyle {
  styleId: string;
  styleName: string;
  brandName: string;
  deptName: string;
  className: string;
  subclassName: string;
  imageUrl?: string;
  colorCount: number;
  skuCount: number;
  bannerStatuses: {
    JDWEB: BannerStatus;
    SZWEB: BannerStatus;
    LSWEB: BannerStatus;
    PLWEB: BannerStatus;
  };
}

interface Banner {
  bannerId: string;
  bannerName: string;
  storeUrl: string;
  isActive: boolean;
  publishedCount: number;
  pendingCount: number;
}

interface VisionSuitePublisherProps {
  businessUnitId?: number;
  onPublishComplete?: () => void;
}

// Banner colors and labels
const BANNER_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  JDWEB: { color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'JD Sports', icon: '🏃' },
  SZWEB: { color: 'text-purple-600', bg: 'bg-purple-500/10', label: 'Size?', icon: '👟' },
  LSWEB: { color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Deadstock', icon: '🔥' },
  PLWEB: { color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'Private Label', icon: '🏷️' }
};

// Status badge component
const StatusBadge: React.FC<{ status: BannerStatus['status']; small?: boolean }> = ({ status, small }) => {
  const config = {
    published: { bg: 'bg-emerald-500', text: 'text-white', label: '●' },
    pending: { bg: 'bg-amber-500', text: 'text-white', label: '◐' },
    flagged: { bg: 'bg-blue-500', text: 'text-white', label: '◯' },
    unpublished: { bg: 'bg-zinc-200 dark:bg-zinc-700', text: 'text-zinc-400', label: '○' }
  };
  const c = config[status];
  return (
    <span className={`
      inline-flex items-center justify-center rounded-full font-medium
      ${small ? 'w-4 h-4 text-[8px]' : 'w-5 h-5 text-[10px]'}
      ${c.bg} ${c.text}
    `}>
      {c.label}
    </span>
  );
};

// Banner selection modal
const BannerSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  banners: Banner[];
  selectedStyleCount: number;
  onPublish: (bannerId: string) => void;
  isPublishing: boolean;
}> = ({ isOpen, onClose, banners, selectedStyleCount, onPublish, isPublishing }) => {
  const [selectedBanner, setSelectedBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Publish to Shopify</h2>
              <p className="text-sm text-white/70">{selectedStyleCount} style{selectedStyleCount !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
        </div>

        {/* Banner Selection */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select a store to publish your products. This uses VisionSuite's standard flow via STYLE_CHARACTERISTICS.
          </p>

          <div className="space-y-2">
            {banners.map(banner => {
              const config = BANNER_CONFIG[banner.bannerId] || BANNER_CONFIG.JDWEB;
              const isSelected = selectedBanner === banner.bannerId;
              
              return (
                <button
                  key={banner.bannerId}
                  onClick={() => setSelectedBanner(banner.bannerId)}
                  className={`
                    w-full p-4 rounded-xl border-2 transition-all duration-200 text-left
                    ${isSelected 
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' 
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }
                  `}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center text-2xl`}>
                      {config.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white">{config.label}</span>
                        <span className="text-xs text-zinc-400 font-mono">{banner.bannerId}</span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-violet-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {banner.publishedCount} published
                        </span>
                        {banner.pendingCount > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Clock className="w-3 h-3" />
                            {banner.pendingCount} pending
                          </span>
                        )}
                      </div>
                    </div>
                    {banner.isActive ? (
                      <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs">
                        Inactive
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info box */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">How it works</p>
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  Publishing sets the <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-xs font-mono">{selectedBanner || 'BANNER'}</code> flag 
                  to 'Y' in STYLE_CHARACTERISTICS. VisionSuite's scheduled job will sync to Shopify within 5 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedBanner && onPublish(selectedBanner)}
            disabled={!selectedBanner || isPublishing}
            className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                Publish {selectedStyleCount} Style{selectedStyleCount !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main component
export const VisionSuitePublisher: React.FC<VisionSuitePublisherProps> = ({ 
  businessUnitId = 1,
  onPublishComplete
}) => {
  // State
  const [styles, setStyles] = useState<VisionSuiteStyle[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [showUnpublishedOnly, setShowUnpublishedOnly] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [pagination, setPagination] = useState({ offset: 0, limit: 25, total: 0 });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch styles
  const fetchStyles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        business_unit_id: String(businessUnitId),
        limit: String(pagination.limit),
        offset: String(pagination.offset),
        ...(search && { search }),
        ...(showUnpublishedOnly && { unpublished_only: 'true' })
      });

      const res = await fetch(`/api/shopify/visionsuite/styles?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setStyles(data.data);
        setPagination(prev => ({ ...prev, total: data.meta.total }));
      } else {
        throw new Error(data.error?.message || 'Failed to fetch styles');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [businessUnitId, search, showUnpublishedOnly, pagination.offset, pagination.limit]);

  // Fetch banners
  const fetchBanners = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/visionsuite/banners?business_unit_id=${businessUnitId}`);
      const data = await res.json();
      if (data.success) {
        setBanners(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch banners:', err);
      // Use defaults
      setBanners([
        { bannerId: 'JDWEB', bannerName: 'JD Sports', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 },
        { bannerId: 'SZWEB', bannerName: 'Size?', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 },
        { bannerId: 'LSWEB', bannerName: 'Deadstock', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 }
      ]);
    }
  }, [businessUnitId]);

  useEffect(() => {
    fetchStyles();
    fetchBanners();
  }, [fetchStyles, fetchBanners]);

  // Handle search with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPagination(prev => ({ ...prev, offset: 0 }));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  // Toggle style selection
  const toggleStyle = (styleId: string) => {
    setSelectedStyles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(styleId)) {
        newSet.delete(styleId);
      } else {
        newSet.add(styleId);
      }
      return newSet;
    });
  };

  // Select all visible
  const selectAll = () => {
    const allIds = styles.map(s => s.styleId);
    setSelectedStyles(new Set(allIds));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedStyles(new Set());
  };

  // Publish to banner
  const handlePublish = async (bannerId: string) => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/shopify/visionsuite/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_unit_id: businessUnitId,
          style_ids: Array.from(selectedStyles),
          banner_id: bannerId,
          publish: true
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccessMessage(`✅ ${data.data.success} styles queued for ${bannerId}!`);
        setSelectedStyles(new Set());
        setShowModal(false);
        onPublishComplete?.();
        // Refresh data after short delay
        setTimeout(() => {
          fetchStyles();
          fetchBanners();
        }, 1000);
      } else {
        throw new Error(data.error?.message || 'Publishing failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Auto-dismiss success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-violet-600" />
            VisionSuite Product Publisher
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Select products and publish to Shopify stores using VisionSuite's standard flow
          </p>
        </div>
        <button
          onClick={fetchStyles}
          className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 animate-in slide-in-from-top duration-300">
          <p className="text-emerald-700 dark:text-emerald-300 font-medium">{successMessage}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by style ID or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowUnpublishedOnly(!showUnpublishedOnly)}
          className={`
            px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all
            ${showUnpublishedOnly 
              ? 'bg-violet-600 text-white' 
              : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
            }
          `}
        >
          <Filter className="w-4 h-4" />
          Unpublished Only
        </button>

        {/* Selection actions */}
        {selectedStyles.size > 0 && (
          <div className="flex items-center gap-2 ml-auto animate-in slide-in-from-right duration-200">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {selectedStyles.size} selected
            </span>
            <button
              onClick={clearSelection}
              className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl text-sm font-medium hover:from-violet-700 hover:to-fuchsia-700 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/25"
            >
              <ArrowUpRight className="w-4 h-4" />
              Publish Selected
            </button>
          </div>
        )}
      </div>

      {/* Status Legend */}
      <div className="flex items-center gap-6 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium">Status:</span>
        <div className="flex items-center gap-1.5">
          <StatusBadge status="published" small />
          <span>Published</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status="pending" small />
          <span>Pending Sync</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status="flagged" small />
          <span>Flagged</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status="unpublished" small />
          <span>Not Published</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
        </div>
      )}

      {/* Styles Grid */}
      {!loading && styles.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <div className="w-8 flex items-center">
              <input
                type="checkbox"
                checked={selectedStyles.size === styles.length && styles.length > 0}
                onChange={() => selectedStyles.size === styles.length ? clearSelection() : selectAll()}
                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-violet-600 focus:ring-violet-500"
              />
            </div>
            <div>Product</div>
            <div className="text-center">SKUs</div>
            <div className="text-center w-40">Store Status</div>
            <div className="w-10"></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {styles.map(style => {
              const isSelected = selectedStyles.has(style.styleId);
              
              return (
                <div
                  key={style.styleId}
                  className={`
                    grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center cursor-pointer transition-colors
                    ${isSelected 
                      ? 'bg-violet-50 dark:bg-violet-950/20' 
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }
                  `}
                  onClick={() => toggleStyle(style.styleId)}
                >
                  {/* Checkbox */}
                  <div className="w-8">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStyle(style.styleId)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-violet-600 focus:ring-violet-500"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Image */}
                    <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                      {style.imageUrl ? (
                        <img 
                          src={style.imageUrl} 
                          alt={style.styleName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-zinc-400" />
                        </div>
                      )}
                    </div>
                    
                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">{style.styleId}</span>
                        <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                          {style.styleName}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {style.brandName} • {style.deptName || 'No Dept'} {style.className ? `/ ${style.className}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* SKU Count */}
                  <div className="text-center">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{style.skuCount}</span>
                    <span className="text-xs text-zinc-400 ml-1">SKUs</span>
                  </div>

                  {/* Banner Statuses */}
                  <div className="flex items-center gap-2 w-40 justify-center">
                    {Object.entries(BANNER_CONFIG).map(([bannerId, config]) => {
                      const status = style.bannerStatuses[bannerId as keyof typeof style.bannerStatuses];
                      if (!status) return null;
                      
                      return (
                        <div
                          key={bannerId}
                          className="flex flex-col items-center gap-0.5"
                          title={`${config.label}: ${status.status}`}
                        >
                          <StatusBadge status={status.status} small />
                          <span className="text-[9px] font-medium text-zinc-400">{bannerId.replace('WEB', '')}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="w-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Quick view action
                      }}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && styles.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
            <ShoppingBag className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-900 dark:text-white">No styles found</h3>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {search ? 'Try adjusting your search criteria' : 'No styles available in VisionSuite'}
          </p>
        </div>
      )}

      {/* Banner Selection Modal */}
      <BannerSelectionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        banners={banners}
        selectedStyleCount={selectedStyles.size}
        onPublish={handlePublish}
        isPublishing={isPublishing}
      />
    </div>
  );
};

export default VisionSuitePublisher;
