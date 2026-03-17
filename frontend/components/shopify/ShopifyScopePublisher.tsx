/**
 * ShopifyScopePublisher - Enterprise Shopify Publishing Experience
 * 
 * Mirrors the Attribute Manager's Scope Explorer design with:
 * - Cascading multi-select filters (BU → Dept → Class → Subclass)
 * - Shopify status filters (Published, Unpublished, Pending)
 * - Beautiful product grid with channel status indicators
 * - Bulk publish actions following VisionSuite SSOT flow
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Package, Filter, ChevronRight, RefreshCw, 
  Store, ExternalLink, Loader2, ArrowUpRight, Clock,
  CheckCircle2, XCircle, AlertCircle, LayoutGrid, List,
  Layers, Building2, Tag, Zap
} from 'lucide-react';
import { Button, SearchableSelect, Select, StatusBadge } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';

// ============================================================================
// TYPES
// ============================================================================

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
  bannerStatuses: Record<string, BannerStatus>;
}

interface Banner {
  bannerId: string;
  bannerName: string;
  storeUrl: string;
  isActive: boolean;
  publishedCount: number;
  pendingCount: number;
}

interface HierarchyData {
  businessUnits: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; buId: string; classes: Array<{ id: string; name: string; subclasses: Array<{ id: string; name: string }> }> }>;
  brands: Array<{ id: string; name: string }>;
}

interface PublishFilters {
  business_unit_id: string[];
  department_id: string[];
  class_id: string[];
  subclass_id: string[];
  brand_id: string[];
  shopify_status: 'all' | 'published' | 'unpublished' | 'pending' | 'flagged';
  has_images: 'all' | 'yes' | 'no';
  search: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BANNER_CONFIG: Record<string, { color: string; bg: string; bgHover: string; label: string; icon: string }> = {
  JESTA: { color: 'text-indigo-600', bg: 'bg-indigo-500/10', bgHover: 'hover:bg-indigo-500/20', label: 'Jesta Demo', icon: '🛍️' }
};

const SHOPIFY_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'published', label: '● Published to Shopify' },
  { value: 'pending', label: '◐ Pending Sync' },
  { value: 'flagged', label: '◯ Flagged (Not Synced)' },
  { value: 'unpublished', label: '○ Not Published' }
];

const HAS_IMAGES_OPTIONS = [
  { value: 'all', label: 'All Products' },
  { value: 'yes', label: '📷 With Images' },
  { value: 'no', label: '🚫 Without Images' }
];

// ============================================================================
// CHANNEL STATUS BADGE
// ============================================================================

const ChannelStatusBadge: React.FC<{ bannerId: string; status: BannerStatus }> = ({ bannerId, status }) => {
  const config = BANNER_CONFIG[bannerId];
  if (!config) return null;

  const statusConfig = {
    published: { bg: 'bg-emerald-500', icon: '●', title: 'Published to Shopify' },
    pending: { bg: 'bg-amber-500', icon: '◐', title: 'Pending Sync' },
    flagged: { bg: 'bg-blue-400', icon: '◯', title: 'Flagged for Publish' },
    unpublished: { bg: 'bg-gray-300', icon: '○', title: 'Not Published' }
  };

  const s = statusConfig[status.status];

  return (
    <div 
      className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg ${config.bg} ${config.bgHover} transition-colors cursor-default`}
      title={`${config.label}: ${s.title}`}
    >
      <span className={`w-3 h-3 rounded-full ${s.bg} flex items-center justify-center text-[8px] text-white font-bold`}>
        {s.icon}
      </span>
      <span className="text-[8px] font-bold text-gray-500">{bannerId.replace('WEB', '')}</span>
    </div>
  );
};

// ============================================================================
// FILTER PANEL (LEFT SIDEBAR)
// ============================================================================

interface FilterPanelProps {
  filters: PublishFilters;
  onFiltersChange: (filters: PublishFilters) => void;
  onApply: () => void;
  hierarchy: HierarchyData | null;
  stats: { published: number; pending: number; unpublished: number };
  isLoading: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  filters, 
  onFiltersChange, 
  onApply, 
  hierarchy, 
  stats,
  isLoading 
}) => {
  // Cascade logic for hierarchy
  const businessUnits = hierarchy?.businessUnits || [];
  
  const departments = useMemo(() => {
    if (!hierarchy || filters.business_unit_id.length === 0) return [];
    return hierarchy.departments.filter(d => 
      filters.business_unit_id.includes(d.buId) || filters.business_unit_id.length === 0
    );
  }, [hierarchy, filters.business_unit_id]);

  const classes = useMemo(() => {
    if (filters.department_id.length === 0) return [];
    const result: Array<{ id: string; name: string }> = [];
    filters.department_id.forEach(deptId => {
      const dept = departments.find(d => d.id === deptId);
      if (dept) result.push(...dept.classes.map(c => ({ id: c.id, name: c.name })));
    });
    return result;
  }, [departments, filters.department_id]);

  const subclasses = useMemo(() => {
    if (filters.class_id.length === 0) return [];
    const result: Array<{ id: string; name: string }> = [];
    filters.department_id.forEach(deptId => {
      const dept = departments.find(d => d.id === deptId);
      if (dept) {
        dept.classes.forEach(cls => {
          if (filters.class_id.includes(cls.id)) {
            result.push(...cls.subclasses);
          }
        });
      }
    });
    return result;
  }, [departments, filters.department_id, filters.class_id]);

  // All subclasses (for when class is not selected - flattened from hierarchy)
  const allSubclasses = useMemo(() => {
    const result: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    
    // If class is selected, use filtered subclasses
    if (filters.class_id.length > 0) return subclasses;
    
    // Otherwise return all subclasses from selected departments (or all departments if none selected)
    const deptList = filters.department_id.length > 0 
      ? departments.filter(d => filters.department_id.includes(d.id))
      : departments;
      
    deptList.forEach(dept => {
      dept.classes?.forEach(cls => {
        cls.subclasses?.forEach(sub => {
          if (!seen.has(sub.id)) {
            seen.add(sub.id);
            result.push({ id: sub.id, name: sub.name });
          }
        });
      });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, filters.department_id, filters.class_id, subclasses]);

  const handleBUChange = (val: string | string[]) => {
    onFiltersChange({
      ...filters,
      business_unit_id: Array.isArray(val) ? val : [val],
      department_id: [],
      class_id: [],
      subclass_id: []
    });
  };

  const handleDeptChange = (val: string | string[]) => {
    onFiltersChange({
      ...filters,
      department_id: Array.isArray(val) ? val : [val],
      class_id: [],
      subclass_id: []
    });
  };

  const handleClassChange = (val: string | string[]) => {
    onFiltersChange({
      ...filters,
      class_id: Array.isArray(val) ? val : [val],
      subclass_id: []
    });
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      <div className="p-6 space-y-8 flex-1 overflow-y-auto">
        {/* Scope Explorer Section */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Filter size={14} className="text-indigo-600" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-tighter">Scope Explorer</h3>
          </div>

          <div className="space-y-4">
            <SearchableSelect
              label="Business Unit"
              value={filters.business_unit_id}
              onChange={handleBUChange}
              options={businessUnits}
              placeholder="Search business units..."
              disabled={isLoading}
              multi={true}
            />

            <SearchableSelect
              label="Department"
              value={filters.department_id}
              onChange={handleDeptChange}
              options={departments.map(d => ({ id: d.id, name: d.name }))}
              placeholder="Search departments..."
              disabled={filters.business_unit_id.length === 0 || isLoading}
              multi={true}
            />

            <SearchableSelect
              label="Class"
              value={filters.class_id}
              onChange={handleClassChange}
              options={classes}
              placeholder="Search classes..."
              disabled={filters.department_id.length === 0 || isLoading}
              multi={true}
            />

            <SearchableSelect
              label="Subclass"
              value={filters.subclass_id}
              onChange={(val) => onFiltersChange({ ...filters, subclass_id: Array.isArray(val) ? val : [val] })}
              options={allSubclasses}
              placeholder="Search subclasses..."
              disabled={filters.business_unit_id.length === 0 || isLoading}
              multi={true}
            />
          </div>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Publish Filters Section */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Store size={14} className="text-purple-600" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-tighter">Shopify Filters</h3>
          </div>

          <div className="space-y-4">
            <SearchableSelect
              label="Brand"
              value={filters.brand_id}
              onChange={(val) => onFiltersChange({ ...filters, brand_id: Array.isArray(val) ? val : [val] })}
              options={hierarchy?.brands || []}
              placeholder="Search brands..."
              disabled={isLoading}
              multi={true}
            />

            <Select
              label="Shopify Status"
              value={filters.shopify_status}
              onChange={(e) => onFiltersChange({ ...filters, shopify_status: e.target.value as any })}
              options={SHOPIFY_STATUS_OPTIONS}
              disabled={isLoading}
            />

            <Select
              label="Images"
              value={filters.has_images}
              onChange={(e) => onFiltersChange({ ...filters, has_images: e.target.value as any })}
              options={HAS_IMAGES_OPTIONS}
              disabled={isLoading}
            />
          </div>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Quick Stats Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-amber-500" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-tighter">Quick Stats</h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
              <p className="text-lg font-black text-emerald-700">{stats.published}</p>
              <p className="text-[9px] font-bold text-emerald-500 uppercase">Published</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
              <p className="text-lg font-black text-amber-700">{stats.pending}</p>
              <p className="text-[9px] font-bold text-amber-500 uppercase">Pending</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center">
              <p className="text-lg font-black text-gray-700">{stats.unpublished}</p>
              <p className="text-[9px] font-bold text-gray-500 uppercase">Unpublished</p>
            </div>
          </div>
        </section>
      </div>

      {/* Apply Button */}
      <div className="p-6 border-t border-gray-100 bg-gray-50/50">
        <Button
          onClick={onApply}
          variant="primary"
          className="w-full shadow-lg shadow-indigo-100/50 py-3"
          disabled={isLoading}
          isLoading={isLoading}
        >
          Update View
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// PUBLISH ACTION PANEL (BOTTOM)
// ============================================================================

interface ActionPanelProps {
  selectedCount: number;
  banners: Banner[];
  selectedBanner: string | null;
  onBannerSelect: (bannerId: string) => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onClearSelection: () => void;
  isPublishing: boolean;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  selectedCount,
  banners,
  selectedBanner,
  onBannerSelect,
  onPublish,
  onUnpublish,
  onClearSelection,
  isPublishing
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-indigo-100 shadow-2xl shadow-indigo-500/10 animate-in slide-in-from-bottom duration-300">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center gap-6">
          {/* Selection Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">{selectedCount} Style{selectedCount !== 1 ? 's' : ''} Selected</p>
              <p className="text-[10px] text-gray-400 font-medium">Ready to publish to Shopify</p>
            </div>
          </div>

          <div className="w-px h-12 bg-gray-200" />

          {/* Target Store Selection */}
          <div className="flex-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Target Store</p>
            <div className="flex gap-2">
              {banners.map(banner => {
                const config = BANNER_CONFIG[banner.bannerId] || BANNER_CONFIG.JESTA;
                const isSelected = selectedBanner === banner.bannerId;
                
                return (
                  <button
                    key={banner.bannerId}
                    onClick={() => onBannerSelect(banner.bannerId)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all
                      ${isSelected 
                        ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                      }
                    `}
                  >
                    <span className="text-lg">{config.icon}</span>
                    <div className="text-left">
                      <p className={`text-xs font-bold ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                        {banner.bannerId}
                      </p>
                      <p className="text-[9px] text-gray-400">{banner.publishedCount} published</p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 size={16} className="text-indigo-600 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-px h-12 bg-gray-200" />

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={onPublish}
              disabled={!selectedBanner || isPublishing}
              isLoading={isPublishing}
              icon={<ArrowUpRight size={16} />}
              className="shadow-lg shadow-indigo-200"
            >
              Publish ({selectedCount})
            </Button>
            <Button
              variant="outline"
              onClick={onUnpublish}
              disabled={!selectedBanner || isPublishing}
            >
              Unpublish
            </Button>
            <button
              onClick={onClearSelection}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>

        {/* Info Bar */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-[10px] text-gray-400">
          <AlertCircle size={12} />
          <span>
            Publishing sets <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-gray-600">{selectedBanner || 'BANNER'}</code> = 'Y' 
            in STYLE_CHARACTERISTICS. VisionSuite's job syncs to Shopify every 5 minutes.
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ShopifyScopePublisherProps {
  onPublishComplete?: () => void;
}

export const ShopifyScopePublisher: React.FC<ShopifyScopePublisherProps> = ({ onPublishComplete }) => {
  // State
  const [filters, setFilters] = useState<PublishFilters>({
    business_unit_id: ['1'], // Default to BU 1
    department_id: [],
    class_id: [],
    subclass_id: [],
    brand_id: [],
    shopify_status: 'all',
    has_images: 'all',
    search: ''
  });

  const [styles, setStyles] = useState<VisionSuiteStyle[]>([]);
  const [hierarchy, setHierarchy] = useState<HierarchyData | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [hierarchyLoading, setHierarchyLoading] = useState(true);
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [selectedBanner, setSelectedBanner] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [stats, setStats] = useState({ published: 0, pending: 0, unpublished: 0 });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch Business Units first, then hierarchy
  useEffect(() => {
    const fetchBusinessUnits = async () => {
      setHierarchyLoading(true);
      try {
        // Fetch BUs from dedicated endpoint (like Attribute Manager does)
        const buRes = await fetch(`${API_BASE_URL}/business-units`);
        const buData = await buRes.json();
        
        let businessUnits: Array<{ id: string; name: string }> = [];
        
        if (buData.success && buData.data) {
          businessUnits = buData.data.map((bu: any) => ({
            id: String(bu.id),
            name: bu.name || `Business Unit ${bu.id}`
          }));
        }
        
        // If no BUs found, use default
        if (businessUnits.length === 0) {
          businessUnits = [{ id: '1', name: 'Default Business Unit' }];
        }
        
        // Set initial BU selection
        if (businessUnits.length > 0 && filters.business_unit_id.length === 0) {
          setFilters(prev => ({ ...prev, business_unit_id: [businessUnits[0].id] }));
        }
        
        // Fetch hierarchy for the first/selected BU
        const selectedBU = filters.business_unit_id[0] || businessUnits[0]?.id || '1';
        const hierRes = await fetch(`${API_BASE_URL}/products/hierarchy?business_unit_id=${selectedBU}`);
        const hierData = await hierRes.json();
        
        setHierarchy({
          businessUnits,
          departments: hierData.success && hierData.data?.departments 
            ? hierData.data.departments.map((d: any) => ({
                id: d.id,
                name: d.name,
                buId: selectedBU,
                classes: d.classes || []
              }))
            : [],
          brands: hierData.success && hierData.data?.brands ? hierData.data.brands : []
        });
        
      } catch (err) {
        console.error('Failed to fetch business units/hierarchy:', err);
        setHierarchy({
          businessUnits: [{ id: '1', name: 'Default Business Unit' }],
          departments: [],
          brands: []
        });
      } finally {
        setHierarchyLoading(false);
      }
    };

    fetchBusinessUnits();
  }, []);

  // Refetch hierarchy when Business Unit changes (cascading)
  useEffect(() => {
    if (filters.business_unit_id.length === 0 || hierarchyLoading) return;
    
    const refetchHierarchy = async () => {
      try {
        const selectedBU = filters.business_unit_id[0];
        const hierRes = await fetch(`${API_BASE_URL}/products/hierarchy?business_unit_id=${selectedBU}`);
        const hierData = await hierRes.json();
        
        setHierarchy(prev => ({
          businessUnits: prev?.businessUnits || [],
          departments: hierData.success && hierData.data?.departments 
            ? hierData.data.departments.map((d: any) => ({
                id: d.id,
                name: d.name,
                buId: selectedBU,
                classes: d.classes || []
              }))
            : [],
          brands: hierData.success && hierData.data?.brands ? hierData.data.brands : []
        }));
      } catch (err) {
        console.error('Failed to refetch hierarchy:', err);
      }
    };
    
    refetchHierarchy();
  }, [filters.business_unit_id]);

  // Fetch banners
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/shopify/visionsuite/banners?business_unit_id=${filters.business_unit_id[0] || '1'}`);
        const data = await res.json();
        if (data.success) {
          setBanners(data.data || []);
        }
      } catch (err) {
        // Use defaults
        setBanners([
          { bannerId: 'JDWEB', bannerName: 'JD Sports', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 },
          { bannerId: 'SZWEB', bannerName: 'Size?', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 },
          { bannerId: 'LSWEB', bannerName: 'Deadstock', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 },
          { bannerId: 'PLWEB', bannerName: 'Private Label', storeUrl: '', isActive: true, publishedCount: 0, pendingCount: 0 }
        ]);
      }
    };
    fetchBanners();
  }, [filters.business_unit_id]);

  // Fetch styles
  const fetchStyles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        business_unit_id: filters.business_unit_id[0] || '1',
        limit: String(pagination.pageSize),
        offset: String((pagination.page - 1) * pagination.pageSize),
        ...(filters.department_id.length > 0 && { dept_id: filters.department_id.join(',') }),
        ...(filters.class_id.length > 0 && { class_id: filters.class_id.join(',') }),
        ...(filters.subclass_id.length > 0 && { subclass_id: filters.subclass_id.join(',') }),
        ...(filters.brand_id.length > 0 && { brand_id: filters.brand_id.join(',') }),
        ...(filters.search && { search: filters.search }),
        ...(filters.shopify_status !== 'all' && { shopify_status: filters.shopify_status }),
        ...(filters.has_images !== 'all' && { has_images: filters.has_images })
      });

      const res = await fetch(`${API_BASE_URL}/shopify/visionsuite/styles?${params}`);
      const data = await res.json();

      if (data.success) {
        setStyles(data.data || []);
        setPagination(prev => ({ ...prev, total: data.meta?.total || 0 }));
        
        // Calculate stats from data
        let published = 0, pending = 0, unpublished = 0;
        (data.data || []).forEach((s: VisionSuiteStyle) => {
          const statuses = Object.values(s.bannerStatuses);
          if (statuses.some(st => st.status === 'published')) published++;
          else if (statuses.some(st => st.status === 'pending')) pending++;
          else unpublished++;
        });
        setStats({ published, pending, unpublished });
      }
    } catch (err) {
      console.error('Failed to fetch styles:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.pageSize]);

  // Handle filter apply
  const handleApply = () => {
    if (pagination.page !== 1) {
      setPagination(prev => ({ ...prev, page: 1 }));
    } else {
      fetchStyles();
    }
  };

  // Initial load AND pagination changes
  useEffect(() => {
    if (!hierarchyLoading) {
      fetchStyles();
    }
    // We only want to trigger this when hierarchy is ready, or page/pageSize changes
    // Filters are handled by the manual handleApply call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyLoading, pagination.page, pagination.pageSize]);

  // Toggle style selection
  const toggleStyle = (styleId: string) => {
    setSelectedStyles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(styleId)) newSet.delete(styleId);
      else newSet.add(styleId);
      return newSet;
    });
  };

  // Select all
  const selectAll = () => setSelectedStyles(new Set(styles.map(s => s.styleId)));
  const clearSelection = () => setSelectedStyles(new Set());

  // Publish action - Direct publish to Shopify (creates products immediately)
  const handlePublish = async () => {
    if (!selectedBanner || selectedStyles.size === 0) return;
    
    setIsPublishing(true);
    try {
      // Use direct publish to actually create products in Shopify
      const res = await fetch(`${API_BASE_URL}/shopify/visionsuite/publish-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_unit_id: parseInt(filters.business_unit_id[0] || '1'),
          style_ids: Array.from(selectedStyles),
          banner_id: selectedBanner
        })
      });
      const data = await res.json();
      
      if (data.success) {
        const published = data.data?.publishedProducts || [];
        const successCount = data.data?.success || 0;
        const failedCount = data.data?.failed || 0;
        
        // Build success message with details
        let message = `🎉 ${successCount} product(s) published to Shopify!`;
        if (failedCount > 0) {
          message += ` (${failedCount} failed)`;
        }
        if (published.length > 0 && published.length <= 3) {
          message += `\n\nPublished: ${published.map((p: any) => p.styleId).join(', ')}`;
        }
        
        setSuccessMessage(message);
        clearSelection();
        onPublishComplete?.();
        
        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
          new Notification('Shopify Publish Complete', { body: message });
        }
        
        setTimeout(fetchStyles, 1000);
      } else {
        setSuccessMessage(`❌ Publish failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Publish failed:', err);
      setSuccessMessage(`❌ Publish error: ${err}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Unpublish action
  const handleUnpublish = async () => {
    if (!selectedBanner || selectedStyles.size === 0) return;
    
    setIsPublishing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/visionsuite/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_unit_id: parseInt(filters.business_unit_id[0] || '1'),
          style_ids: Array.from(selectedStyles),
          banner_id: selectedBanner,
          publish: false
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccessMessage(`✅ ${data.data?.success || selectedStyles.size} styles unpublished from ${selectedBanner}`);
        clearSelection();
        setTimeout(fetchStyles, 1000);
      }
    } catch (err) {
      console.error('Unpublish failed:', err);
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
    <div className="flex h-[calc(100vh-180px)] bg-gray-50/30 rounded-2xl overflow-hidden border border-gray-100">
      {/* Left Sidebar: Filters */}
      <div className="w-80 flex-shrink-0">
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onApply={handleApply}
          hierarchy={hierarchy}
          stats={stats}
          isLoading={loading || hierarchyLoading}
        />
      </div>

      {/* Main Content: Product Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
          <div>
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
              Styles ({pagination.total.toLocaleString()})
            </h2>
            <p className="text-[10px] text-gray-400 font-medium">
              Select styles and publish to Shopify channels
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search styles..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="pl-9 pr-4 py-2 w-64 text-sm border border-gray-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchStyles}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-100 animate-in slide-in-from-top duration-300">
            <p className="text-sm font-medium text-emerald-700">{successMessage}</p>
          </div>
        )}

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : styles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Package size={48} className="mb-4 opacity-50" />
              <p className="font-medium">No styles found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : viewMode === 'list' ? (
            /* List View */
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={styles.length > 0 && selectedStyles.size === styles.length}
                        onChange={() => selectedStyles.size === styles.length ? clearSelection() : selectAll()}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Style</th>
                    <th className="px-4 py-3 text-left">Brand</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-center">SKUs</th>
                    <th className="px-4 py-3 text-center">Channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {styles.map(style => {
                    const isSelected = selectedStyles.has(style.styleId);
                    
                    return (
                      <tr
                        key={style.styleId}
                        onClick={() => toggleStyle(style.styleId)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-gray-50/50'}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStyle(style.styleId)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                              {style.imageUrl ? (
                                <img src={style.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                  <Package size={16} />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900">{style.styleId}</p>
                              <p className="text-[10px] text-gray-500 truncate max-w-[200px]">{style.styleName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-gray-700">{style.brandName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] text-gray-500">{style.deptName}</p>
                          <p className="text-[10px] text-gray-400">{style.className} / {style.subclassName}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-bold text-gray-700">{style.skuCount}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {Object.entries(style.bannerStatuses).map(([bannerId, status]) => (
                              <ChannelStatusBadge key={bannerId} bannerId={bannerId} status={status} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-4 gap-4">
              {styles.map(style => {
                const isSelected = selectedStyles.has(style.styleId);
                
                return (
                  <div
                    key={style.styleId}
                    onClick={() => toggleStyle(style.styleId)}
                    className={`
                      bg-white rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md
                      ${isSelected ? 'border-indigo-500 bg-indigo-50/30 shadow-md' : 'border-gray-100 hover:border-gray-200'}
                    `}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleStyle(style.styleId)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex gap-1">
                        {Object.entries(style.bannerStatuses).map(([bannerId, status]) => (
                          <ChannelStatusBadge key={bannerId} bannerId={bannerId} status={status} />
                        ))}
                      </div>
                    </div>
                    
                    <div className="aspect-square rounded-lg bg-gray-100 mb-3 overflow-hidden">
                      {style.imageUrl ? (
                        <img src={style.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package size={32} />
                        </div>
                      )}
                    </div>
                    
                    <p className="text-xs font-bold text-gray-900 truncate">{style.styleId}</p>
                    <p className="text-[10px] text-gray-500 truncate">{style.styleName}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-1">{style.brandName}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.total > pagination.pageSize && (
          <div className="px-6 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1 || loading}
              >
                Previous
              </Button>
              <span className="px-3 py-1 text-sm font-medium text-gray-700">
                {pagination.page} / {Math.ceil(pagination.total / pagination.pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize) || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Panel */}
      <ActionPanel
        selectedCount={selectedStyles.size}
        banners={banners}
        selectedBanner={selectedBanner}
        onBannerSelect={setSelectedBanner}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onClearSelection={clearSelection}
        isPublishing={isPublishing}
      />
    </div>
  );
};

export default ShopifyScopePublisher;
