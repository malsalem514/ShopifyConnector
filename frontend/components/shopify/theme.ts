/**
 * Shopify Hub Theme System
 * 
 * Consistent color palette, spacing, and component styles
 * across all 5 phases of the Shopify Store Management suite.
 * 
 * Based on PM Vision's purple/pink aesthetic with Shopify green accents.
 * 
 * @author FarsightIQ
 * @version 1.0.0
 */

export const ShopifyTheme = {
  // PRIMARY COLORS - Purple/Pink Gradient (PM Vision Brand)
  colors: {
    // Primary Purple (Main brand color)
    primary: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',  // Main purple
      600: '#9333ea',
      700: '#7e22ce',
      800: '#6b21a8',
      900: '#581c87',
    },
    
    // Secondary Pink (Accent color)
    secondary: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#f472b6',
      500: '#ec4899',  // Main pink
      600: '#db2777',
      700: '#be185d',
      800: '#9f1239',
      900: '#831843',
    },
    
    // Success Green (Shopify brand alignment)
    success: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',  // Main green
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
    },
    
    // Warning Amber
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
    
    // Danger Red
    danger: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
    },
    
    // Info Blue
    info: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
    },
    
    // Neutral Gray
    neutral: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    }
  },
  
  // GRADIENTS
  gradients: {
    primary: 'from-purple-500 to-pink-500',
    primaryLight: 'from-purple-50 to-pink-50',
    primaryBorder: 'from-purple-200 to-pink-200',
    
    success: 'from-emerald-500 to-green-500',
    successLight: 'from-emerald-50 to-green-50',
    
    warning: 'from-amber-500 to-orange-500',
    warningLight: 'from-amber-50 to-orange-50',
    
    danger: 'from-red-500 to-rose-500',
    dangerLight: 'from-red-50 to-rose-50',
    
    info: 'from-blue-500 to-indigo-500',
    infoLight: 'from-blue-50 to-indigo-50',
  },
  
  // COMPONENT STYLES
  components: {
    // Card styles for each phase
    card: {
      base: 'bg-white rounded-lg shadow-md border border-gray-200 p-6',
      hover: 'hover:shadow-lg transition-shadow duration-200',
      primary: 'bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200',
      success: 'bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200',
      warning: 'bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200',
      danger: 'bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-200',
      info: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200',
    },
    
    // Button styles
    button: {
      primary: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-md hover:shadow-lg',
      secondary: 'bg-white border-2 border-purple-300 text-purple-700 hover:bg-purple-50',
      success: 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white',
      warning: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white',
      danger: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white',
      ghost: 'text-gray-700 border border-gray-300 hover:bg-gray-50',
    },
    
    // Badge styles for status
    badge: {
      primary: 'px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded',
      success: 'px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded',
      warning: 'px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded',
      danger: 'px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded',
      info: 'px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded',
      neutral: 'px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded',
    },
    
    // Health score colors
    health: {
      excellent: { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50', border: 'border-emerald-200' },
      good: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50', border: 'border-blue-200' },
      fair: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50', border: 'border-amber-200' },
      poor: { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50', border: 'border-red-200' },
    },
    
    // Alert/Notice boxes
    alert: {
      success: 'bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4',
      warning: 'bg-amber-50 border-2 border-amber-200 rounded-lg p-4',
      danger: 'bg-red-50 border-2 border-red-200 rounded-lg p-4',
      info: 'bg-blue-50 border-2 border-blue-200 rounded-lg p-4',
    },
  },
  
  // TYPOGRAPHY
  typography: {
    pageTitle: 'text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600',
    sectionTitle: 'text-lg font-bold text-gray-900',
    cardTitle: 'text-base font-semibold text-gray-900',
    label: 'text-sm font-medium text-gray-700',
    body: 'text-sm text-gray-600',
    caption: 'text-xs text-gray-500',
    code: 'font-mono text-xs bg-gray-100 px-2 py-1 rounded',
  },
  
  // SPACING
  spacing: {
    section: 'space-y-6',
    card: 'space-y-4',
    tight: 'space-y-2',
  },
  
  // PHASE-SPECIFIC THEMES
  phases: {
    phase1: {
      name: 'Health Dashboard',
      primary: 'purple',
      gradient: 'from-purple-500 to-pink-500',
      icon: '💜',
    },
    phase2: {
      name: 'Sync History',
      primary: 'blue',
      gradient: 'from-blue-500 to-indigo-500',
      icon: '🔄',
    },
    phase3: {
      name: 'API Logging',
      primary: 'emerald',
      gradient: 'from-emerald-500 to-green-500',
      icon: '📊',
    },
    phase4: {
      name: 'Webhooks',
      primary: 'pink',
      gradient: 'from-pink-500 to-rose-500',
      icon: '🔗',
    },
    phase5: {
      name: 'Bulk Operations',
      primary: 'purple',
      gradient: 'from-purple-600 to-pink-600',
      icon: '⚡',
    },
  },
};

// HELPER FUNCTIONS
export const getHealthColor = (score: number) => {
  if (score >= 90) return ShopifyTheme.components.health.excellent;
  if (score >= 70) return ShopifyTheme.components.health.good;
  if (score >= 50) return ShopifyTheme.components.health.fair;
  return ShopifyTheme.components.health.poor;
};

export const getStatusBadge = (status: string): string => {
  const statusMap: Record<string, string> = {
    success: ShopifyTheme.components.badge.success,
    active: ShopifyTheme.components.badge.success,
    completed: ShopifyTheme.components.badge.success,
    
    warning: ShopifyTheme.components.badge.warning,
    pending: ShopifyTheme.components.badge.warning,
    processing: ShopifyTheme.components.badge.warning,
    
    error: ShopifyTheme.components.badge.danger,
    failed: ShopifyTheme.components.badge.danger,
    cancelled: ShopifyTheme.components.badge.danger,
    
    info: ShopifyTheme.components.badge.info,
    queued: ShopifyTheme.components.badge.info,
    
    default: ShopifyTheme.components.badge.neutral,
  };
  
  return statusMap[status.toLowerCase()] || statusMap.default;
};
