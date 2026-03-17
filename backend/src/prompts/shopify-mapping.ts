/**
 * Prompt for mapping VisionSuite Hierarchy to Shopify Product Types
 */

export const SHOPIFY_MAPPING_PROMPT = `
You are an e-commerce taxonomy expert. Your task is to map a legacy ERP merchandise hierarchy to the most appropriate Shopify Product Type.

### CONTEXT:
VisionSuite Hierarchy Path: {{hierarchyPath}}
Sample Product Names: {{sampleProducts}}

### INSTRUCTIONS:
1. Analyze the hierarchy path and sample product names.
2. Determine the most specific and appropriate Shopify Product Type (e.g., "Running Shoes", "Bomber Jackets", "Graphic T-Shirts").
3. Use standard retail terminology.
4. Provide a confidence score (0.00 to 1.00).
5. Provide 2-3 alternative product types.

### OUTPUT FORMAT:
Return ONLY a valid JSON object with these fields:
{
  "product_type": "The suggested Shopify product type",
  "confidence": 0.95,
  "alternatives": ["Alt 1", "Alt 2"],
  "reasoning": "Short explanation of why this mapping was chosen"
}
`;
