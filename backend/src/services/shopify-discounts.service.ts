/**
 * Shopify Discounts Service
 * 
 * Manages discount codes and automatic discounts using Shopify GraphQL Admin API.
 * Follows official Shopify patterns and recommendations.
 * 
 * Official Documentation:
 * - https://shopify.dev/docs/api/admin-graphql/2024-10/mutations/discountCodeBasicCreate
 * - https://shopify.dev/docs/api/admin-graphql/2024-10/mutations/discountAutomaticBasicCreate
 * 
 * Required Scopes: write_discounts, read_discounts
 * 
 * @author FarsightIQ Shopify Hub
 * @version 1.0.0
 * @date 2026-01-08
 */

import { logger } from '../utils/logger.js';
import { ShopifyActionsService } from './shopify-actions.service.js';

const SHOPIFY_API_VERSION = '2024-10';

export interface DiscountCodeInput {
  code: string;
  title: string;
  valueType: 'percentage' | 'fixed_amount';
  value: number;
  appliesTo?: 'all' | 'products' | 'collections';
  productIds?: string[];
  collectionIds?: string[];
  minimumRequirement?: {
    type: 'subtotal' | 'quantity';
    value: number;
  };
  customerSelection?: 'all' | 'prerequisite';
  usageLimit?: number;
  oncePerCustomer?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface AutomaticDiscountInput {
  title: string;
  valueType: 'percentage' | 'fixed_amount';
  value: number;
  appliesTo?: 'all' | 'products' | 'collections';
  productIds?: string[];
  collectionIds?: string[];
  minimumRequirement?: {
    type: 'subtotal' | 'quantity';
    value: number;
  };
  startsAt?: string;
  endsAt?: string;
}

export interface DiscountListItem {
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

export class ShopifyDiscountsService {
  private actionsService: ShopifyActionsService;

  constructor() {
    this.actionsService = new ShopifyActionsService();
  }

  /**
   * Create a discount code (requires code entry at checkout)
   * Official Shopify pattern: discountCodeBasicCreate mutation
   */
  async createDiscountCode(bannerId: string, input: DiscountCodeInput): Promise<{
    success: boolean;
    discountId?: string;
    code?: string;
    message: string;
  }> {
    try {
      const creds = await this.actionsService.getCredentials(bannerId);
      if (!creds) {
        return { success: false, message: 'Store credentials not found' };
      }

      // Build GraphQL mutation (official Shopify schema)
      const mutation = `
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  usageLimit
                  appliesOncePerCustomer
                  customerSelection {
                    ... on DiscountCustomerAll {
                      allCustomers
                    }
                  }
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              code
              message
            }
          }
        }
      `;

      // Build variables following Shopify's input structure
      const variables = {
        basicCodeDiscount: {
          title: input.title,
          code: input.code,
          startsAt: input.startsAt || new Date().toISOString(),
          endsAt: input.endsAt,
          customerSelection: {
            all: input.customerSelection === 'all' || !input.customerSelection
          },
          customerGets: {
            value: input.valueType === 'percentage' 
              ? { percentage: input.value / 100 }
              : { discountAmount: { amount: input.value, appliesOnEachItem: false } },
            items: this.buildItemsInput(input)
          },
          // Note: minimumRequirement temporarily disabled - API 2024-10 schema mismatch
          // TODO: Research correct structure for API 2024-10
          // ...(input.minimumRequirement && {
          //   minimumRequirement: input.minimumRequirement.type === 'subtotal'
          //     ? { greaterThanOrEqualToSubtotal: { amount: input.minimumRequirement.value } }
          //     : { greaterThanOrEqualToQuantity: input.minimumRequirement.value }
          // }),
          ...(input.usageLimit && { usageLimit: input.usageLimit }),
          ...(input.oncePerCustomer && { appliesOncePerCustomer: input.oncePerCustomer })
        }
      };

      // Execute mutation
      const result = await this.actionsService.graphql(
        creds.shopUrl,
        creds.accessToken,
        mutation,
        variables
      );

      // Check for errors
      if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
        const errors = result.data.discountCodeBasicCreate.userErrors;
        logger.error('Discount code creation errors:', errors);
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(', ')
        };
      }

      const discountNode = result.data?.discountCodeBasicCreate?.codeDiscountNode;
      if (!discountNode) {
        return { success: false, message: 'Failed to create discount code' };
      }

      // Log to VisionSuite SSOT
      await this.actionsService.logToVisionSuite(
        'SHOPIFY_CREATE_DISCOUNT_CODE',
        { bannerId, ...input },
        result,
        200
      );

      return {
        success: true,
        discountId: discountNode.id,
        code: discountNode.codeDiscount.codes.edges[0]?.node.code,
        message: 'Discount code created successfully'
      };

    } catch (error: any) {
      logger.error('Create discount code error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Create an automatic discount (applies without code)
   * Official Shopify pattern: discountAutomaticBasicCreate mutation
   */
  async createAutomaticDiscount(bannerId: string, input: AutomaticDiscountInput): Promise<{
    success: boolean;
    discountId?: string;
    message: string;
  }> {
    try {
      const creds = await this.actionsService.getCredentials(bannerId);
      if (!creds) {
        return { success: false, message: 'Store credentials not found' };
      }

      const mutation = `
        mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  startsAt
                  endsAt
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              code
              message
            }
          }
        }
      `;

      const variables = {
        automaticBasicDiscount: {
          title: input.title,
          startsAt: input.startsAt || new Date().toISOString(),
          endsAt: input.endsAt,
          customerGets: {
            value: input.valueType === 'percentage'
              ? { percentage: input.value / 100 }
              : { discountAmount: { amount: input.value, appliesOnEachItem: false } },
            items: this.buildItemsInput(input)
          }
          // Note: minimumRequirement temporarily disabled - API 2024-10 schema mismatch
          // TODO: Research correct structure for API 2024-10
          // ...(input.minimumRequirement && {
          //   minimumRequirement: input.minimumRequirement.type === 'subtotal'
          //     ? { greaterThanOrEqualToSubtotal: { amount: input.minimumRequirement.value } }
          //     : { greaterThanOrEqualToQuantity: input.minimumRequirement.value }
          // })
        }
      };

      const result = await this.actionsService.graphql(
        creds.shopUrl,
        creds.accessToken,
        mutation,
        variables
      );

      if (result.data?.discountAutomaticBasicCreate?.userErrors?.length > 0) {
        const errors = result.data.discountAutomaticBasicCreate.userErrors;
        logger.error('Automatic discount creation errors:', errors);
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(', ')
        };
      }

      const discountNode = result.data?.discountAutomaticBasicCreate?.automaticDiscountNode;
      if (!discountNode) {
        return { success: false, message: 'Failed to create automatic discount' };
      }

      await this.actionsService.logToVisionSuite(
        'SHOPIFY_CREATE_AUTOMATIC_DISCOUNT',
        { bannerId, ...input },
        result,
        200
      );

      return {
        success: true,
        discountId: discountNode.id,
        message: 'Automatic discount created successfully'
      };

    } catch (error: any) {
      logger.error('Create automatic discount error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * List all discounts (code + automatic)
   */
  async listDiscounts(bannerId: string, first: number = 50): Promise<{
    success: boolean;
    discounts: DiscountListItem[];
    meta?: { total: number; active: number; scheduled: number; expired: number };
  }> {
    try {
      const creds = await this.actionsService.getCredentials(bannerId);
      if (!creds) {
        return { success: false, discounts: [] };
      }

      const query = `
        query {
          codeDiscounts(first: ${first}) {
            edges {
              node {
                ... on DiscountCodeBasic {
                  codeCount
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  title
                  status
                  startsAt
                  endsAt
                  usageLimit
                  asyncUsageCount
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
          }
          automaticDiscounts(first: ${first}) {
            edges {
              node {
                ... on DiscountAutomaticBasic {
                  title
                  status
                  startsAt
                  endsAt
                  asyncUsageCount
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
          }
        }
      `;

      const result = await this.actionsService.graphql(
        creds.shopUrl,
        creds.accessToken,
        query
      );

      const discounts: DiscountListItem[] = [];

      // Parse code discounts
      if (result.data?.codeDiscounts?.edges) {
        for (const edge of result.data.codeDiscounts.edges) {
          const discount = edge.node;
          discounts.push({
            id: `code_${discount.codes.edges[0]?.node.code}`,
            type: 'CODE',
            title: discount.title,
            code: discount.codes.edges[0]?.node.code,
            valueType: discount.customerGets.value.percentage ? 'percentage' : 'fixed_amount',
            value: discount.customerGets.value.percentage 
              ? discount.customerGets.value.percentage * 100
              : parseFloat(discount.customerGets.value.amount?.amount || 0),
            status: discount.status,
            timesUsed: discount.asyncUsageCount || 0,
            usageLimit: discount.usageLimit,
            startsAt: discount.startsAt,
            endsAt: discount.endsAt
          });
        }
      }

      // Parse automatic discounts
      if (result.data?.automaticDiscounts?.edges) {
        for (const edge of result.data.automaticDiscounts.edges) {
          const discount = edge.node;
          discounts.push({
            id: `auto_${discount.title}`,
            type: 'AUTOMATIC',
            title: discount.title,
            valueType: discount.customerGets.value.percentage ? 'percentage' : 'fixed_amount',
            value: discount.customerGets.value.percentage
              ? discount.customerGets.value.percentage * 100
              : parseFloat(discount.customerGets.value.amount?.amount || 0),
            status: discount.status,
            timesUsed: discount.asyncUsageCount || 0,
            startsAt: discount.startsAt,
            endsAt: discount.endsAt
          });
        }
      }

      // Calculate meta stats
      const active = discounts.filter(d => d.status === 'ACTIVE').length;
      const scheduled = discounts.filter(d => d.status === 'SCHEDULED').length;
      const expired = discounts.filter(d => d.status === 'EXPIRED').length;

      return {
        success: true,
        discounts,
        meta: {
          total: discounts.length,
          active,
          scheduled,
          expired
        }
      };

    } catch (error: any) {
      logger.error('List discounts error:', error);
      return { success: false, discounts: [] };
    }
  }

  /**
   * Delete a discount (code or automatic)
   */
  async deleteDiscount(bannerId: string, discountId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const creds = await this.actionsService.getCredentials(bannerId);
      if (!creds) {
        return { success: false, message: 'Store credentials not found' };
      }

      const mutation = `
        mutation discountCodeDelete($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.actionsService.graphql(
        creds.shopUrl,
        creds.accessToken,
        mutation,
        { id: discountId }
      );

      if (result.data?.discountCodeDelete?.userErrors?.length > 0) {
        const errors = result.data.discountCodeDelete.userErrors;
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(', ')
        };
      }

      await this.actionsService.logToVisionSuite(
        'SHOPIFY_DELETE_DISCOUNT',
        { bannerId, discountId },
        result,
        200
      );

      return {
        success: true,
        message: 'Discount deleted successfully'
      };

    } catch (error: any) {
      logger.error('Delete discount error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Helper: Build items input for discount target
   */
  private buildItemsInput(input: DiscountCodeInput | AutomaticDiscountInput): any {
    if (input.appliesTo === 'products' && input.productIds) {
      return {
        products: {
          productsToAdd: input.productIds
        }
      };
    } else if (input.appliesTo === 'collections' && input.collectionIds) {
      return {
        collections: {
          add: input.collectionIds
        }
      };
    } else {
      return {
        all: true
      };
    }
  }
}
