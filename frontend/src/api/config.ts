/**
 * API Configuration
 * 
 * Environment-driven config with sensible defaults
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
export const BUSINESS_UNIT_ID = Number(import.meta.env.VITE_BUSINESS_UNIT_ID) || 1;
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true';

