// Store Configuration Schema & Utilities

export interface BranchConfig {
  branch_id: string;
  branch_name: string;
  is_default?: boolean;
  inventory_api: {
    url: string;
    method: 'GET' | 'POST';
    query_param: string;
  };
}

export interface ProductSchemaMapping {
  barcode: (string | number)[];
  product_id?: (string | number)[];
  title: (string | number)[];
  brand: (string | number)[];
  category: (string | number)[];
  price: (string | number)[];
  images: (string | number)[];
}

export interface NormalizationConfig {
  fallback_fields: Record<string, string[]>;
  defaults: Record<string, any>;
}

export interface InventoryRequestConfig {
  timeout_ms: number;
  retry_attempts: number;
}

export interface InvoiceSchemaMapping {
  items: string[];
  total_quantity: string[];
  total: string[];
  date: string[];
}

export interface InvoiceDeliveryConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
}

export interface PaymentConfig {
  supported_methods: ('cash' | 'card' | 'upi_counter' | 'upi_app' | 'razorpay')[];
  upi?: {
    pa: string;
    pn: string;
    currency: string;
    url_format: string;
  };
}

export interface SecurityConfig {
  cart_hash_algorithm: 'SHA256';
}

export interface StoreConfig {
  cart_timeout_minutes: number;
  max_items_per_cart: number;
  product_schema: ProductSchemaMapping;
  normalization: NormalizationConfig;
  inventory_request: InventoryRequestConfig;
  invoice_schema: InvoiceSchemaMapping;
  invoice_delivery: InvoiceDeliveryConfig | null;
  payment_config: PaymentConfig;
  security: SecurityConfig;
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  cart_timeout_minutes: 30,
  max_items_per_cart: 20,
  product_schema: {
    barcode: ['barcode'],
    product_id: ['id'],
    title: ['title'],
    brand: ['brand'],
    category: ['category'],
    price: ['price'],
    images: ['images', 0],
  },
  normalization: {
    fallback_fields: {
      title: ['name', 'item_name', 'product_name'],
      category: ['cat', 'group'],
      price: ['cost', 'amount'],
    },
    defaults: {
      brand: 'Unknown',
      images: [],
    },
  },
  inventory_request: {
    timeout_ms: 3000,
    retry_attempts: 2,
  },
  invoice_schema: {
    items: ['items'],
    total_quantity: ['total_quantity'],
    total: ['total'],
    date: ['date'],
  },
  invoice_delivery: null,
  payment_config: {
    supported_methods: ['cash', 'card', 'upi_counter'],
    upi: undefined,
  },
  security: {
    cart_hash_algorithm: 'SHA256',
  },
};

/**
 * Extract a field from a nested object using a path array.
 * e.g., extractField(data, ['items', 0, 'title']) => data.items[0].title
 */
export function extractField(obj: any, path: (string | number)[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}

/**
 * Normalize a raw API response into a standard product object
 * using product_schema mapping and normalization config.
 */
export function normalizeProduct(
  rawData: any,
  schema: ProductSchemaMapping,
  normalization: NormalizationConfig
): Record<string, any> | null {
  const result: Record<string, any> = {};

  const fields = ['barcode', 'product_id', 'title', 'brand', 'category', 'price', 'images'] as const;

  for (const field of fields) {
    const path = schema[field as keyof ProductSchemaMapping];
    let value = path ? extractField(rawData, path) : null;

    // Fallback fields
    if (value == null && normalization.fallback_fields[field]) {
      for (const alt of normalization.fallback_fields[field]) {
        value = extractField(rawData, [alt]);
        if (value != null) break;
      }
    }

    // Defaults
    if (value == null && field in normalization.defaults) {
      value = normalization.defaults[field];
    }

    result[field] = value;
  }

  // Must have at least a title
  if (!result.title) return null;

  return result;
}

/**
 * Map internal invoice data to the store's invoice schema format.
 */
export function mapInvoiceToSchema(
  invoiceData: Record<string, any>,
  invoiceSchema: InvoiceSchemaMapping
): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [field, path] of Object.entries(invoiceSchema)) {
    const value = invoiceData[field];
    // Build nested structure from path
    let current = mapped;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) current[path[i]] = {};
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }
  return mapped;
}
