/**
 * Discount Management Panel
 * 
 * Create and manage Shopify discount codes and automatic discounts.
 * Follows official Shopify patterns and PM Vision theming.
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../src/api/config';
import { ShopifyTheme } from './theme';
import { RefreshCw, Plus, Trash2, Tag, Zap, Calendar, TrendingUp, Users, Percent, DollarSign } from 'lucide-react';

interface Discount {
  id: string;
  type: 'CODE' | 'AUTOMATIC';
  title: string;
  code?: string;
  valueType: string;
  value: number;
  status: 'ACTIVE' | 'EXPIRED' | 'SCHEDULED';
  timesUsed: number;
  usageLimit?: number;
  startsAt?: string;
  endsAt?: string;
}

interface DiscountManagementPanelProps {
  bannerId: string;
}

const DiscountManagementPanel: React.FC<DiscountManagementPanelProps> = ({ bannerId }) => {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'code' | 'automatic'>('code');
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    valueType: 'percentage',
    value: '',
    appliesTo: 'all',
    minimumSubtotal: '',
    usageLimit: '',
    oncePerCustomer: false,
    startsAt: '',
    endsAt: ''
  });

  useEffect(() => {
    fetchDiscounts();
  }, [bannerId]);

  const fetchDiscounts = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/discounts`);
      const data = await res.json();
      if (data.success) {
        setDiscounts(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch discounts', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title || !formData.value) {
      alert('Please fill in required fields');
      return;
    }

    if (createType === 'code' && !formData.code) {
      alert('Please enter a discount code');
      return;
    }

    const payload = {
      ...(createType === 'code' && { code: formData.code.toUpperCase() }),
      title: formData.title,
      valueType: formData.valueType,
      value: parseFloat(formData.value),
      appliesTo: formData.appliesTo,
      ...(formData.minimumSubtotal && {
        minimumRequirement: {
          type: 'subtotal',
          value: parseFloat(formData.minimumSubtotal)
        }
      }),
      ...(formData.usageLimit && createType === 'code' && { usageLimit: parseInt(formData.usageLimit) }),
      ...(formData.oncePerCustomer && createType === 'code' && { oncePerCustomer: true }),
      ...(formData.startsAt && { startsAt: new Date(formData.startsAt).toISOString() }),
      ...(formData.endsAt && { endsAt: new Date(formData.endsAt).toISOString() })
    };

    console.log('Creating discount with bannerId:', bannerId);
    console.log('Payload:', payload);

    try {
      const endpoint = createType === 'code' ? 'code' : 'automatic';
      const url = `${API_BASE_URL}/shopify/stores/${bannerId}/discounts/${endpoint}`;
      console.log('POST to:', url);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Response data:', data);

      if (data.success) {
        alert(`${createType === 'code' ? 'Discount code' : 'Automatic discount'} created successfully!`);
        setShowCreateModal(false);
        resetForm();
        fetchDiscounts();
      } else {
        alert(`Failed: ${data.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error('Discount creation error:', e);
      alert(`Error: ${e.message}`);
    }
  };

  const handleDelete = async (discountId: string) => {
    if (!confirm('Delete this discount? This cannot be undone.')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/shopify/stores/${bannerId}/discounts/${discountId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        alert('Discount deleted successfully');
        fetchDiscounts();
      } else {
        alert(`Failed: ${data.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      title: '',
      valueType: 'percentage',
      value: '',
      appliesTo: 'all',
      minimumSubtotal: '',
      usageLimit: '',
      oncePerCustomer: false,
      startsAt: '',
      endsAt: ''
    });
  };

  const activeDiscounts = discounts.filter(d => d.status === 'ACTIVE');
  const scheduledDiscounts = discounts.filter(d => d.status === 'SCHEDULED');
  const expiredDiscounts = discounts.filter(d => d.status === 'EXPIRED');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin text-purple-600" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`${ShopifyTheme.components.card.primary} p-4 rounded-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase">Active</p>
              <p className="text-3xl font-black text-purple-700 mt-1">{activeDiscounts.length}</p>
            </div>
            <Tag className="text-purple-400" size={32} />
          </div>
        </div>

        <div className={`${ShopifyTheme.components.card.info} p-4 rounded-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase">Scheduled</p>
              <p className="text-3xl font-black text-blue-700 mt-1">{scheduledDiscounts.length}</p>
            </div>
            <Calendar className="text-blue-400" size={32} />
          </div>
        </div>

        <div className={`bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200 p-4 rounded-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase">Expired</p>
              <p className="text-3xl font-black text-gray-700 mt-1">{expiredDiscounts.length}</p>
            </div>
            <TrendingUp className="text-gray-400" size={32} />
          </div>
        </div>

        <div className={`${ShopifyTheme.components.card.success} p-4 rounded-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase">Total Uses</p>
              <p className="text-3xl font-black text-emerald-700 mt-1">
                {discounts.reduce((sum, d) => sum + d.timesUsed, 0)}
              </p>
            </div>
            <Users className="text-emerald-400" size={32} />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div>
          <p className={ShopifyTheme.typography.body}>{discounts.length} discounts configured</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchDiscounts}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 ${ShopifyTheme.components.button.ghost}`}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => {
              setCreateType('code');
              setShowCreateModal(true);
            }}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 ${ShopifyTheme.components.button.primary}`}
          >
            <Tag size={14} />
            Code Discount
          </button>
          <button
            onClick={() => {
              setCreateType('automatic');
              setShowCreateModal(true);
            }}
            className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 ${ShopifyTheme.components.button.success}`}
          >
            <Zap size={14} />
            Automatic
          </button>
        </div>
      </div>

      {/* Discounts List */}
      {discounts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Tag size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium">No discounts configured</p>
          <p className="text-sm text-gray-500 mt-1">Create your first discount to boost sales</p>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => { setCreateType('code'); setShowCreateModal(true); }}
              className={`px-4 py-2 rounded-lg ${ShopifyTheme.components.button.primary}`}
            >
              Create Discount Code
            </button>
            <button
              onClick={() => { setCreateType('automatic'); setShowCreateModal(true); }}
              className={`px-4 py-2 rounded-lg ${ShopifyTheme.components.button.success}`}
            >
              Create Automatic Discount
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {discounts.map((discount) => (
            <div
              key={discount.id}
              className={`bg-white border-2 rounded-lg p-4 hover:shadow-md transition-shadow ${
                discount.status === 'ACTIVE' ? 'border-purple-200' : 
                discount.status === 'SCHEDULED' ? 'border-blue-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {discount.type === 'CODE' ? (
                      <Tag size={16} className="text-purple-600" />
                    ) : (
                      <Zap size={16} className="text-emerald-600" />
                    )}
                    <span className={`text-xs font-bold ${
                      discount.type === 'CODE' ? 'text-purple-700' : 'text-emerald-700'
                    }`}>
                      {discount.type}
                    </span>
                    <span className={ShopifyTheme.components.badge[
                      discount.status === 'ACTIVE' ? 'success' :
                      discount.status === 'SCHEDULED' ? 'info' : 'neutral'
                    ]}>
                      {discount.status}
                    </span>
                    {discount.code && (
                      <code className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                        {discount.code}
                      </code>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">{discount.title}</h4>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      {discount.valueType === 'percentage' ? (
                        <Percent size={14} className="text-purple-600" />
                      ) : (
                        <DollarSign size={14} className="text-emerald-600" />
                      )}
                      <span className="font-bold">{discount.value}{discount.valueType === 'percentage' ? '%' : '$'} off</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users size={14} className="text-blue-600" />
                      <span>Used {discount.timesUsed} times{discount.usageLimit ? ` / ${discount.usageLimit}` : ''}</span>
                    </div>
                    {discount.endsAt && (
                      <div className="flex items-center gap-1">
                        <Calendar size={14} className="text-amber-600" />
                        <span>Ends {new Date(discount.endsAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(discount.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete discount"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Discount Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); resetForm(); } }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-[10000]">
            <div className={`p-6 border-b border-gray-200 bg-gradient-to-r ${
              createType === 'code' ? 'from-purple-50 to-pink-50' : 'from-emerald-50 to-green-50'
            }`}>
              <div className="flex items-center gap-3">
                {createType === 'code' ? (
                  <Tag className="text-purple-600" size={24} />
                ) : (
                  <Zap className="text-emerald-600" size={24} />
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Create {createType === 'code' ? 'Discount Code' : 'Automatic Discount'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {createType === 'code' 
                      ? 'Customer enters code at checkout'
                      : 'Applies automatically to eligible orders'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {createType === 'code' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="SAVE20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="20% Off Holiday Sale"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount Type *
                  </label>
                  <select
                    value={formData.valueType}
                    onChange={(e) => setFormData({ ...formData, valueType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Value *
                  </label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={formData.valueType === 'percentage' ? '20' : '10'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Purchase
                </label>
                <input
                  type="number"
                  value={formData.minimumSubtotal}
                  onChange={(e) => setFormData({ ...formData, minimumSubtotal: e.target.value })}
                  placeholder="50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum subtotal required (optional)</p>
              </div>

              {createType === 'code' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Usage Limit
                    </label>
                    <input
                      type="number"
                      value={formData.usageLimit}
                      onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                      placeholder="100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum number of uses (optional)</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="oncePerCustomer"
                      checked={formData.oncePerCustomer}
                      onChange={(e) => setFormData({ ...formData, oncePerCustomer: e.target.checked })}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="oncePerCustomer" className="text-sm text-gray-700">
                      One use per customer
                    </label>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.endsAt}
                    onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className={`px-4 py-2 rounded-lg cursor-pointer ${ShopifyTheme.components.button.ghost}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className={`px-4 py-2 rounded-lg cursor-pointer ${
                  createType === 'code' 
                    ? ShopifyTheme.components.button.primary 
                    : ShopifyTheme.components.button.success
                }`}
              >
                Create Discount
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountManagementPanel;
