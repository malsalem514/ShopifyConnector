import React from 'react';
import { Calendar, MapPin, Package, ExternalLink, User } from 'lucide-react';
import { StatusBadge } from '../../shared/UI';

/**
 * Order Card Component
 * Beautiful card view for orders with status badges and origin indicators
 * VisionSuite SSOT: Displays data from V_ECOMM_ORDERS
 */

interface OrderCardProps {
  order: {
    orderId: string | number;
    wfeTransId?: string;
    customerId?: string;
    orderDate: string;
    status: string;
    siteId?: string;
    origin: string;
  };
  onClick: () => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick }) => {
  /**
   * Format date in human-readable format
   */
  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return date;
    }
  };

  /**
   * Map order status to StatusBadge colors
   * Following VisionSuite status conventions
   */
  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' => {
    const statusUpper = (status || '').toUpperCase();
    
    // Green: Completed states
    if (statusUpper.includes('SHIP') || statusUpper.includes('DELIVER')) return 'success';
    
    // Red: Failed/cancelled states
    if (statusUpper.includes('CANCEL') || statusUpper.includes('FAIL')) return 'error';
    
    // Blue: Hold/review states
    if (statusUpper.includes('HOLD') || statusUpper.includes('REVIEW')) return 'info';
    
    // Amber: In-progress states (default)
    return 'warning';
  };

  /**
   * Get origin badge with icon and color
   * Maps VisionSuite ORDER_ORIGIN values to visual badges
   */
  const getOriginBadge = (origin: string) => {
    const originUpper = (origin || '').toUpperCase().trim();
    
    const badges: Record<string, { label: string; color: string }> = {
      'SHOPIFY': { 
        label: '🛍️ Shopify', 
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200' 
      },
      'OMNI': { 
        label: '🏢 OMNI', 
        color: 'bg-blue-50 text-blue-700 border-blue-200' 
      },
      'EDOM': { 
        label: '📱 EDOM', 
        color: 'bg-purple-50 text-purple-700 border-purple-200' 
      },
      'POS': { 
        label: '🏪 POS', 
        color: 'bg-amber-50 text-amber-700 border-amber-200' 
      },
    };
    
    const badge = badges[originUpper] || { 
      label: originUpper, 
      color: 'bg-gray-50 text-gray-700 border-gray-200' 
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold border ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-purple-200 transition-all duration-200 cursor-pointer group"
      data-testid={`order-card-${order.orderId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="text-sm font-bold text-gray-900 truncate">
              Order #{order.wfeTransId || order.orderId}
            </h4>
            {getOriginBadge(order.origin)}
          </div>
          <p className="text-xs text-gray-500 truncate">
            ID: {order.orderId}
          </p>
        </div>
        <StatusBadge 
          status={getStatusColor(order.status)} 
          label={order.status} 
        />
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        {order.customerId && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <User size={14} className="text-gray-400 flex-shrink-0" />
            <span className="truncate">Customer: {order.customerId}</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{formatDate(order.orderDate)}</span>
        </div>
        
        {order.siteId && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <MapPin size={14} className="text-gray-400 flex-shrink-0" />
            <span className="truncate">Site: {order.siteId}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={(e) => { 
            e.stopPropagation(); 
            onClick(); 
          }}
          className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 group-hover:gap-2 transition-all"
          data-testid={`view-order-${order.orderId}`}
        >
          View Details
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
};
