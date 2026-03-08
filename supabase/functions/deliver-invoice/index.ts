import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { session_id } = await req.json()
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get mart config for invoice_delivery
    const { data: mart } = await supabase
      .from('marts')
      .select('config, name')
      .eq('id', invoice.mart_id)
      .single()

    const config = mart?.config as any || {}
    const delivery = config.invoice_delivery
    const invoiceSchema = config.invoice_schema

    if (!delivery?.url) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No invoice delivery URL configured, skipping.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Prepare invoice data
    const invoiceData: Record<string, any> = {
      items: invoice.items,
      total_quantity: invoice.total_quantity,
      total: invoice.total_amount,
      date: invoice.created_at,
      invoice_number: invoice.invoice_number,
      payment_method: invoice.payment_method,
      store_name: mart?.name,
    }

    // Apply invoice_schema mapping if provided
    let payload = invoiceData
    if (invoiceSchema) {
      const mapped: Record<string, any> = {}
      for (const [field, path] of Object.entries(invoiceSchema)) {
        if (Array.isArray(path) && path.length > 0) {
          const value = invoiceData[field]
          // Set nested value
          let current = mapped
          for (let i = 0; i < (path as string[]).length - 1; i++) {
            const key = (path as string[])[i]
            if (!current[key]) current[key] = {}
            current = current[key]
          }
          current[(path as string[])[(path as string[]).length - 1]] = value
        }
      }
      payload = Object.keys(mapped).length > 0 ? mapped : invoiceData
    }

    // Send to delivery URL
    const resp = await fetch(delivery.url, {
      method: delivery.method || 'POST',
      headers: delivery.headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    return new Response(JSON.stringify({
      success: resp.ok,
      status: resp.status,
      message: resp.ok ? 'Invoice delivered' : 'Delivery failed',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
