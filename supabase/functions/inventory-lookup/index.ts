import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractField(obj: any, path: (string | number)[]): any {
  let current = obj
  for (const key of path) {
    if (current == null) return null
    current = current[key]
  }
  return current
}

function normalizeProduct(
  rawData: any,
  schema: Record<string, (string | number)[]>,
  normalization: { fallback_fields?: Record<string, string[]>; defaults?: Record<string, any> }
): Record<string, any> | null {
  const result: Record<string, any> = {}
  const fields = ['barcode', 'product_id', 'title', 'brand', 'category', 'price', 'images']

  for (const field of fields) {
    const path = schema[field]
    let value = path ? extractField(rawData, path) : null

    // Fallback fields
    if (value == null && normalization.fallback_fields?.[field]) {
      for (const alt of normalization.fallback_fields[field]) {
        value = extractField(rawData, [alt])
        if (value != null) break
      }
    }

    // Defaults
    if (value == null && normalization.defaults && field in normalization.defaults) {
      value = normalization.defaults[field]
    }

    result[field] = value
  }

  if (!result.title) return null
  return result
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries: number
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (resp.ok) return resp
    } catch (e) {
      console.log(`Attempt ${attempt + 1} failed:`, e)
      if (attempt === retries) return null
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { barcode, branch_id } = await req.json()
    if (!barcode || !branch_id) {
      return new Response(JSON.stringify({ error: 'barcode and branch_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Get branch + mart config
    const { data: branch, error: branchErr } = await supabase
      .from('branches')
      .select('inventory_api_url, mart_id, marts(config, name)')
      .eq('id', branch_id)
      .single()

    if (branchErr || !branch) {
      return new Response(JSON.stringify({ error: 'Branch not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const mart = (branch as any).marts
    const config = mart?.config || {}
    const productSchema = config.product_schema || {
      barcode: ['barcode'], title: ['title'], brand: ['brand'],
      category: ['category'], price: ['price'], images: ['images', 0],
    }
    const normalization = config.normalization || {
      fallback_fields: { title: ['name', 'item_name', 'product_name'], category: ['cat', 'group'], price: ['cost', 'amount'] },
      defaults: { brand: 'Unknown', images: [] },
    }
    const inventoryRequest = config.inventory_request || { timeout_ms: 3000, retry_attempts: 2 }

    // 1. Try local products table first
    const { data: localProduct } = await supabase
      .from('products')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('barcode', barcode)
      .eq('is_active', true)
      .single()

    if (localProduct) {
      return new Response(JSON.stringify({
        product: {
          barcode: localProduct.barcode,
          product_id: localProduct.id,
          title: localProduct.title,
          brand: localProduct.brand,
          category: localProduct.category,
          price: localProduct.price,
          image_url: localProduct.image_url,
        },
        source: 'products_table',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Try branch inventory API if configured
    if (branch.inventory_api_url) {
      const apiUrl = branch.inventory_api_url.replace('{barcode}', barcode)
      const resp = await fetchWithRetry(
        apiUrl,
        { headers: { 'Accept': 'application/json' } },
        inventoryRequest.timeout_ms,
        inventoryRequest.retry_attempts
      )

      if (resp) {
        const data = await resp.json()
        const normalized = normalizeProduct(data, productSchema, normalization)
        if (normalized) {
          return new Response(JSON.stringify({
            product: {
              barcode: normalized.barcode || barcode,
              product_id: normalized.product_id,
              title: normalized.title,
              brand: normalized.brand,
              category: normalized.category,
              price: normalized.price || 0,
              image_url: Array.isArray(normalized.images) ? normalized.images[0] : normalized.images,
            },
            source: 'inventory_api',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // 3. Fallback: mock product database
    const MOCK_PRODUCTS: Record<string, any> = {
      '8901138510022': { title: 'Himalaya Nourishing Body Lotion 100ml', brand: 'Himalaya', category: 'Personal Care', price: 120, image_url: 'https://images.barcodelookup.com/156200/1562004268-1.jpg' },
      '8906006721821': { title: 'Lion Dates (Kimjo)', brand: 'Lion', category: 'Food', price: 85, image_url: null },
      '8906019413010': { title: '555 Scrub Pad', brand: '555', category: 'Household', price: 30, image_url: null },
      '8901396315803': { title: 'Dettol Liquid Handwash 100ml - Lemon', brand: 'Dettol', category: 'Personal Care', price: 55, image_url: null },
      '8901088080262': { title: 'Parachute Advansed Coconut Hair Oil 75ml', brand: 'Parachute', category: 'Personal Care', price: 48, image_url: null },
      '8904004400250': { title: 'Haldirams Soya Stick 150g', brand: 'Haldirams', category: 'Food & Snacks', price: 40, image_url: 'https://images.barcodelookup.com/61313/613135241-1.jpg' },
      '8901725710095': { title: 'Mangaldeep Sambrani', brand: 'Mangaldeep', category: 'Household', price: 65, image_url: null },
      '8908024732025': { title: 'Barkaas Water Bottle 200ml', brand: 'Barkaas', category: 'Beverages', price: 20, image_url: null },
      '8901138711962': { title: 'Himalaya Soap - Neem & Turmeric', brand: 'Himalaya', category: 'Personal Care', price: 45, image_url: null },
      '8901765126122': { title: 'Hauser Pen (Germany)', brand: 'Hauser', category: 'Stationery', price: 25, image_url: null },
    }

    const mock = MOCK_PRODUCTS[barcode]
    if (mock) {
      return new Response(JSON.stringify({
        product: { barcode, ...mock },
        source: 'mock',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Try UPC Item DB as last resort
    try {
      const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.items?.length > 0) {
          const item = data.items[0]
          return new Response(JSON.stringify({
            product: {
              barcode,
              title: item.title || 'Unknown Product',
              brand: item.brand || null,
              category: item.category || null,
              price: item.lowest_recorded_price || Math.floor(Math.random() * 200) + 10,
              image_url: item.images?.[0] || null,
            },
            source: 'upcitemdb',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    } catch {}

    return new Response(JSON.stringify({ error: 'Product not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
