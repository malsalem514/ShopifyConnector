import React from 'react';
import { Store, Globe, Building2, Smartphone, ShoppingBag } from 'lucide-react';

/**
 * Order Origin Filter Component
 * Displays order counts by channel with beautiful channel cards
 * VisionSuite SSOT: Uses data from V_ECOMM_ORDERS.ORDER_ORIGIN
 */

interface OrderOriginFilterProps {
  stats: {
    all: number;
    shopify: number;
    omni: number;
    edom: number;
    pos: number;
    [key: string]: number;
  };
  selected: string | null;
  onChange: (origin: string | null) => void;
}

export const OrderOriginFilter: React.FC<OrderOriginFilterProps> = ({ 
  stats, 
  selected, 
  onChange 
}) => {
  const origins = [
    { 
      id: null, 
      label: 'All Orders', 
      count: stats.all, 
      icon: Globe, 
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      activeColor: 'bg-gray-100 border-gray-400'
    },
    { 
      id: 'SHOPIFY', 
      label: 'Shopify', 
      count: stats.shopify, 
      icon: ShoppingBag, 
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      activeColor: 'bg-emerald-100 border-emerald-500'
    },
    { 
      id: 'OMNI', 
      label: 'OMNI', 
      count: stats.omni, 
      icon: Building2, 
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      activeColor: 'bg-blue-100 border-blue-500'
    },
    { 
      id: 'EDOM', 
      label: 'EDOM', 
      count: stats.edom, 
      icon: Smartphone, 
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      activeColor: 'bg-purple-100 border-purple-500'
    },
    { 
      id: 'POS', 
      label: 'POS', 
      count: stats.pos, 
      icon: Store, 
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      activeColor: 'bg-amber-100 border-amber-500'
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
        Order Origin
      </h4>
      <div className="grid grid-cols-5 gap-3">
        {origins.map(origin => {
          const Icon = origin.icon;
          const isActive = selected === origin.id;
          
          return (
            <button
              key={origin.id || 'all'}
              onClick={() => onChange(origin.id)}
              className={`
                relative p-4 rounded-lg border-2 transition-all duration-200
                ${isActive 
                  ? `${origin.activeColor} shadow-sm` 
                  : `${origin.bgColor} ${origin.borderColor} hover:${origin.activeColor} hover:shadow-sm`
                }
              `}
              data-testid={`origin-filter-${origin.id || 'all'}`}
            >
              <div className={`${origin.color} mb-2`}>
                <Icon size={20} strokeWidth={2.5} />
              </div>
              <div className="text-xs font-semibold text-gray-600 mb-1">
                {origin.label}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {origin.count.toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
