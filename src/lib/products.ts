import type { Product } from './store';

// Local product database for demo (fallback when API is unavailable)
const LOCAL_PRODUCTS: Record<string, Product> = {
  '8901138510022': {
    barcode: '8901138510022',
    title: 'Himalaya Nourishing Body Lotion 100ml',
    brand: 'Himalaya',
    category: 'Personal Care',
    price: 120,
    image: 'https://images.barcodelookup.com/156200/1562004268-1.jpg',
  },
  '8906006721821': {
    barcode: '8906006721821',
    title: 'Lion Dates (Kimjo)',
    brand: 'Lion',
    category: 'Food',
    price: 85,
  },
  '8906019413010': {
    barcode: '8906019413010',
    title: '555 Scrub Pad',
    brand: '555',
    category: 'Household',
    price: 30,
  },
  '8901396315803': {
    barcode: '8901396315803',
    title: 'Dettol Liquid Handwash 100ml - Lemon',
    brand: 'Dettol',
    category: 'Personal Care',
    price: 55,
  },
  '8901088080262': {
    barcode: '8901088080262',
    title: 'Parachute Advansed Coconut Hair Oil 75ml',
    brand: 'Parachute',
    category: 'Personal Care',
    price: 48,
  },
  '8904004400250': {
    barcode: '8904004400250',
    title: 'Haldirams Soya Stick 150g',
    brand: 'Haldirams',
    category: 'Food & Snacks',
    price: 40,
    image: 'https://images.barcodelookup.com/61313/613135241-1.jpg',
  },
  '8901725710095': {
    barcode: '8901725710095',
    title: 'Mangaldeep Sambrani',
    brand: 'Mangaldeep',
    category: 'Household',
    price: 65,
  },
  '8908024732025': {
    barcode: '8908024732025',
    title: 'Barkaas Water Bottle 200ml',
    brand: 'Barkaas',
    category: 'Beverages',
    price: 20,
  },
  '8901138711962': {
    barcode: '8901138711962',
    title: 'Himalaya Soap - Neem & Turmeric',
    brand: 'Himalaya',
    category: 'Personal Care',
    price: 45,
  },
  '8901765126122': {
    barcode: '8901765126122',
    title: 'Hauser Pen (Germany)',
    brand: 'Hauser',
    category: 'Stationery',
    price: 25,
  },
};

export async function lookupProduct(barcode: string): Promise<Product | null> {
  // Check local DB first
  if (LOCAL_PRODUCTS[barcode]) {
    return LOCAL_PRODUCTS[barcode];
  }

  // Try UPC Item DB API (free, no auth)
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          barcode,
          title: item.title || 'Unknown Product',
          description: item.description,
          brand: item.brand,
          category: item.category,
          image: item.images?.[0],
          price: item.lowest_recorded_price || Math.floor(Math.random() * 200) + 10,
        };
      }
    }
  } catch (err) {
    console.log('API lookup failed, using fallback');
  }

  return null;
}

export function getLocalProducts(): Product[] {
  return Object.values(LOCAL_PRODUCTS);
}
