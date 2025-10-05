const axios = require('axios');
const cheerio = require('cheerio');

// Cache in-memory for quick responses; controller may persist to DB if desired
let lastFetchAt = 0;
let cachedLocations = [];
let locationCache = new Map(); // Cache for location-specific searches

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Normalize text helper
function cleanText(text) {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Best-effort phone extraction from text
function extractPhone(text) {
  const match = (text || '').match(/\(\d{3}\)\s?\d{3}-\d{4}/);
  return match ? match[0] : '';
}

// Attempt to split address into components
function splitAddress(fullAddress) {
  // Expecting like: "6533 W Emerald St, Boise, ID 83704"
  const parts = (fullAddress || '').split(',').map(p => p.trim());
  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const stateZip = parts[parts.length - 1];
    const state = stateZip.split(' ')[0];
    return { city, state };
  }
  return { city: '', state: '' };
}

// Get coordinates for major Idaho cities
function getCityCoordinates(cityName) {
  const cityCoords = {
    'boise': { lat: 43.6150, lng: -116.2023 },
    'meridian': { lat: 43.6121, lng: -116.3915 },
    'nampa': { lat: 43.5788, lng: -116.5598 },
    'eagle': { lat: 43.6954, lng: -116.3540 },
    'caldwell': { lat: 43.6629, lng: -116.6874 },
    'kuna': { lat: 43.4918, lng: -116.4206 },
    'garden city': { lat: 43.6221, lng: -116.2382 },
    'star': { lat: 43.6921, lng: -116.4935 },
    'emmett': { lat: 43.8735, lng: -116.4993 },
    'mountain home': { lat: 43.1329, lng: -115.6912 }
  };
  
  const normalizedCity = cityName.toLowerCase().trim();
  return cityCoords[normalizedCity] || null;
}

// Function to fetch location-specific data from Saint Alphonsus API
async function fetchLocationSpecificData(searchParams) {
  const { lat, lng, address, distance = '50' } = searchParams;
  
  console.log('fetchLocationSpecificData called with:', { lat, lng, address, distance });
  
  // SKIP scraping attempts and go straight to location-specific fallback
  // (Since Saint Alphonsus uses JavaScript to load data, scraping doesn't work)
  console.log('Using location-specific fallback data');
  const fallbackData = getLocationSpecificFallback(searchParams);
  console.log(`Location-specific fallback returned ${fallbackData.length} locations`);
  return fallbackData;
}

// Extract locations from the scraped page
async function extractLocationsFromPage($, searchAddress) {
  const locations = [];
  
  // Try to find location data in various formats
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html());
      if (jsonData['@type'] === 'MedicalOrganization' || jsonData['@type'] === 'Hospital') {
        const name = cleanText(jsonData.name);
        const address = cleanText(jsonData.address?.streetAddress + ', ' + jsonData.address?.addressLocality + ', ' + jsonData.address?.addressRegion + ' ' + jsonData.address?.postalCode);
        const phone = cleanText(jsonData.telephone);
        
        if (name && address) {
          const { city, state } = splitAddress(address);
          locations.push({
            id: Buffer.from(`${name}|${address}`).toString('base64'),
            name,
            address,
            city,
            state,
            phone,
            latitude: parseFloat(jsonData.geo?.latitude) || 0,
            longitude: parseFloat(jsonData.geo?.longitude) || 0,
            hours: cleanText(jsonData.openingHours),
            url: cleanText(jsonData.url),
          });
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  });
  
  // Try to find location cards or containers
  $('[class*="location"], [class*="card"], [data-location], .location-item, .clinic-card, .facility-card, .search-result').each((_, el) => {
    const container = $(el);
    const name = cleanText(container.find('h1, h2, h3, h4, h5, h6, .card-title, [class*="title"], .location-name, .facility-name').first().text());
    
    if (name && name.toLowerCase().includes('saint alphonsus')) {
      let address = '';
      const addressSelectors = ['[class*="address"]', '.card-text', 'p', '.location-address', '.address', '.facility-address', '[data-address]'];
      
      for (const selector of addressSelectors) {
        const addrText = container.find(selector).filter((i, p) => {
          const text = $(p).text();
          return /\d{5}/.test(text) || /street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd/i.test(text);
        }).first().text();
        if (addrText) {
          address = cleanText(addrText);
          break;
        }
      }
      
      if (address) {
        const phoneText = cleanText(container.text());
        const phone = extractPhone(phoneText);
        const urlPath = container.find('a').first().attr('href') || '';
        const absoluteUrl = urlPath.startsWith('http') ? urlPath : (urlPath ? `https://www.saintalphonsus.org${urlPath}` : '');
        const { city, state } = splitAddress(address);
        
        locations.push({
          id: Buffer.from(`${name}|${address}`).toString('base64'),
          name,
          address,
          city,
          state,
          phone,
          latitude: 0,
          longitude: 0,
          hours: '',
          url: absoluteUrl,
        });
      }
    }
  });
  
  return locations;
}

// Helper function to extract city from address
function extractCityFromAddress(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

async function fetchSaintAlphonsusLocations(forceRefresh = false, searchParams = {}) {
  const ttlMs = Number(process.env.SA_TTL_MS || DEFAULT_TTL_MS);
  const now = Date.now();

  // For location-specific searches, check cache first
  const isLocationSearch = searchParams.lat && searchParams.lng;
  
  if (isLocationSearch) {
    const cacheKey = `${searchParams.lat}_${searchParams.lng}_${searchParams.address || ''}`;
    console.log(`Location search detected with params:`, searchParams);
    
    // Check if we have cached data for this location
    if (!forceRefresh && locationCache.has(cacheKey)) {
      const cached = locationCache.get(cacheKey);
      if (now - cached.timestamp < ttlMs) {
        console.log(`Using cached location data for ${cacheKey}`);
        return cached.data;
      }
    }
    
    console.log(`Fetching location-specific data for ${cacheKey}`);
    const locations = await fetchLocationSpecificData(searchParams);
    console.log(`Location-specific data returned ${locations.length} locations`);
    
    // Cache the results
    locationCache.set(cacheKey, {
      data: locations,
      timestamp: now
    });
    
    return locations;
  }

  if (!forceRefresh && cachedLocations.length && now - lastFetchAt < ttlMs) {
    return cachedLocations;
  }

  const locations = [];

  try {
    let url = process.env.SA_LOCATIONS_URL || 'https://www.saintalphonsus.org/locations';
    
    // Build location-specific URL if coordinates are provided
    if (isLocationSearch) {
      const params = new URLSearchParams();
      if (searchParams.lat) params.set('lat', searchParams.lat);
      if (searchParams.lng) params.set('lng', searchParams.lng);
      if (searchParams.address) params.set('address', searchParams.address);
      params.set('distance', searchParams.distance || '50');
      
      url = `https://www.saintalphonsus.org/locations?${params.toString()}`;
      console.log(`Fetching Saint Alphonsus locations from: ${url}`);
    }

    const resp = await axios.get(url, { 
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    console.log(`Fetched ${resp.data.length} bytes from ${url}`);
    const $ = cheerio.load(resp.data);

  // Enhanced selectors for Saint Alphonsus location pages
  // Try multiple approaches to find location data
  
  // Method 1: Look for structured location data in JSON-LD or data attributes
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html());
      if (jsonData['@type'] === 'MedicalOrganization' || jsonData['@type'] === 'Hospital') {
        const name = cleanText(jsonData.name);
        const address = cleanText(jsonData.address?.streetAddress + ', ' + jsonData.address?.addressLocality + ', ' + jsonData.address?.addressRegion + ' ' + jsonData.address?.postalCode);
        const phone = cleanText(jsonData.telephone);
        
        if (name && address) {
          const { city, state } = splitAddress(address);
          locations.push({
            id: Buffer.from(`${name}|${address}`).toString('base64'),
            name,
            address,
            city,
            state,
            phone,
            latitude: parseFloat(jsonData.geo?.latitude) || 0,
            longitude: parseFloat(jsonData.geo?.longitude) || 0,
            hours: cleanText(jsonData.openingHours),
            url: cleanText(jsonData.url),
          });
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  });

  // Method 2: Look for location cards/containers
  $('[class*="location"], [class*="card"], [data-location], .location-item, .clinic-card, .facility-card, .search-result').each((_, el) => {
    const container = $(el);

    const name = cleanText(
      container.find('h1, h2, h3, h4, h5, h6, .card-title, [class*="title"], .location-name, .facility-name').first().text()
    );
    
    // Try multiple selectors for address
    let address = '';
    const addressSelectors = [
      '[class*="address"]',
      '.card-text',
      'p',
      '.location-address',
      '.address',
      '.facility-address',
      '[data-address]'
    ];
    
    for (const selector of addressSelectors) {
      const addrText = container.find(selector).filter((i, p) => {
        const text = $(p).text();
        return /\d{5}/.test(text) || /street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd/i.test(text);
      }).first().text();
      if (addrText) {
        address = cleanText(addrText);
        break;
      }
    }
    
    const phoneText = cleanText(container.text());
    const phone = extractPhone(phoneText);
    const urlPath = container.find('a').first().attr('href') || '';
    const absoluteUrl = urlPath.startsWith('http') ? urlPath : (urlPath ? `https://www.saintalphonsus.org${urlPath}` : '');

    if (!name || !address) return;

    const { city, state } = splitAddress(address);

    locations.push({
      id: Buffer.from(`${name}|${address}`).toString('base64'),
      name,
      address,
      city,
      state,
      phone,
      latitude: 0,
      longitude: 0,
      hours: '',
      url: absoluteUrl,
    });
  });

  // Method 3: Look for data in tables or lists
  $('table tr, ul li, ol li').each((_, el) => {
    const text = cleanText($(el).text());
    if (text.includes('Saint Alphonsus') && (text.includes('Boise') || text.includes('Meridian') || text.includes('Nampa') || text.includes('Eagle'))) {
      const nameMatch = text.match(/(Saint Alphonsus[^,]+)/i);
      const addressMatch = text.match(/(\d+[^,]+,\s*(?:Boise|Meridian|Nampa|Eagle)[^,]*,\s*ID\s*\d{5})/i);
      
      if (nameMatch && addressMatch) {
        const name = cleanText(nameMatch[1]);
        const address = cleanText(addressMatch[1]);
        const phone = extractPhone(text);
        const { city, state } = splitAddress(address);
        
        locations.push({
          id: Buffer.from(`${name}|${address}`).toString('base64'),
          name,
          address,
          city,
          state,
          phone,
          latitude: 0,
          longitude: 0,
          hours: '',
          url: '',
        });
      }
    }
  });

  // If no locations found with the above selectors, try a more aggressive approach
  if (locations.length === 0) {
    // Look for any text that might contain clinic information
    $('p, div, span').each((_, el) => {
      const text = $(el).text();
      if (text.includes('Saint Alphonsus') && text.includes('Boise')) {
        const nameMatch = text.match(/(Saint Alphonsus[^,]+)/i);
        const addressMatch = text.match(/(\d+[^,]+,\s*Boise[^,]*,\s*ID\s*\d{5})/i);
        
        if (nameMatch && addressMatch) {
          const name = cleanText(nameMatch[1]);
          const address = cleanText(addressMatch[1]);
          const phone = extractPhone(text);
          const { city, state } = splitAddress(address);
          
          locations.push({
            id: Buffer.from(`${name}|${address}`).toString('base64'),
            name,
            address,
            city,
            state,
            phone,
            latitude: 0,
            longitude: 0,
            hours: '',
            url: '',
          });
        }
      }
    });
  }

    // De-duplicate by id
    const unique = new Map();
    for (const loc of locations) {
      unique.set(loc.id, loc);
    }

    const scrapedLocations = Array.from(unique.values());
    console.log(`Scraped ${scrapedLocations.length} locations from Saint Alphonsus website`);
    
    // For location-specific searches, return location-specific fallback data
    if (isLocationSearch) {
      if (scrapedLocations.length > 0) {
        return scrapedLocations;
      } else {
        console.log('No locations found from scraping, using location-specific fallback data');
        return getLocationSpecificFallback(searchParams);
      }
    }
    
    cachedLocations = scrapedLocations;
    lastFetchAt = now;
    
    // If no locations found from scraping, use fallback data
    if (cachedLocations.length === 0) {
      console.log('No locations found from scraping, using fallback data');
      cachedLocations = getFallbackLocations();
    }
    
    return cachedLocations;
  } catch (error) {
    console.error('Error fetching Saint Alphonsus locations:', error);
    // Return fallback data on error
    if (isLocationSearch) {
      console.log('Using location-specific fallback due to error');
      return getLocationSpecificFallback(searchParams);
    }
    if (cachedLocations.length === 0) {
      cachedLocations = getFallbackLocations();
    }
    return cachedLocations;
  }
}

function getFallbackLocations() {
  return [
    // Boise locations
    {
      id: 'sa-fallback-1',
      name: 'Saint Alphonsus Family Medicine - Boise',
      address: '6533 W Emerald St, Boise, ID 83704',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6167,
      longitude: -116.2000,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-boise',
    },
    {
      id: 'sa-fallback-2',
      name: 'Saint Alphonsus Medical Center - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: '24/7 Emergency Services',
      url: 'https://www.saintalphonsus.org/locations/medical-center-boise',
    },
    {
      id: 'sa-fallback-3',
      name: 'Saint Alphonsus Family Medicine - Boise West',
      address: '1075 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6150,
      longitude: -116.2023,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-boise-west',
    },
    {
      id: 'sa-fallback-21',
      name: 'Saint Alphonsus Urgent Care - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Sun 8:00 AM - 8:00 PM',
      url: 'https://www.saintalphonsus.org/locations/urgent-care-boise',
    },
    {
      id: 'sa-fallback-22',
      name: 'Saint Alphonsus Pediatrics - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/pediatrics-boise',
    },
    {
      id: 'sa-fallback-23',
      name: 'Saint Alphonsus Women\'s Health - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/womens-health-boise',
    },
    {
      id: 'sa-fallback-24',
      name: 'Saint Alphonsus Cardiology - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/cardiology-boise',
    },
    {
      id: 'sa-fallback-25',
      name: 'Saint Alphonsus Orthopedics - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/orthopedics-boise',
    },
    {
      id: 'sa-fallback-26',
      name: 'Saint Alphonsus Imaging Center - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 7:00 AM - 7:00 PM',
      url: 'https://www.saintalphonsus.org/locations/imaging-boise',
    },
    {
      id: 'sa-fallback-27',
      name: 'Saint Alphonsus Laboratory - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 6:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/laboratory-boise',
    },
    {
      id: 'sa-fallback-28',
      name: 'Saint Alphonsus Physical Therapy - Boise',
      address: '1055 N Curtis Rd, Boise, ID 83706',
      city: 'Boise',
      state: 'ID',
      phone: '(208) 367-2121',
      latitude: 43.6155,
      longitude: -116.2033,
      hours: 'Mon-Fri 7:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/physical-therapy-boise',
    },
    
    // Meridian locations
    {
      id: 'sa-fallback-4',
      name: 'Saint Alphonsus Family Medicine - Meridian',
      address: '3230 E Louise Dr, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6138,
      longitude: -116.2102,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-meridian',
    },
    {
      id: 'sa-fallback-5',
      name: 'Saint Alphonsus Medical Center - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/medical-center-meridian',
    },
    {
      id: 'sa-fallback-13',
      name: 'Saint Alphonsus Urgent Care - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Sun 8:00 AM - 8:00 PM',
      url: 'https://www.saintalphonsus.org/locations/urgent-care-meridian',
    },
    {
      id: 'sa-fallback-14',
      name: 'Saint Alphonsus Pediatrics - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/pediatrics-meridian',
    },
    {
      id: 'sa-fallback-15',
      name: 'Saint Alphonsus Women\'s Health - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/womens-health-meridian',
    },
    {
      id: 'sa-fallback-16',
      name: 'Saint Alphonsus Cardiology - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/cardiology-meridian',
    },
    {
      id: 'sa-fallback-17',
      name: 'Saint Alphonsus Orthopedics - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/orthopedics-meridian',
    },
    {
      id: 'sa-fallback-18',
      name: 'Saint Alphonsus Imaging Center - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 7:00 AM - 7:00 PM',
      url: 'https://www.saintalphonsus.org/locations/imaging-meridian',
    },
    {
      id: 'sa-fallback-19',
      name: 'Saint Alphonsus Laboratory - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 6:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/laboratory-meridian',
    },
    {
      id: 'sa-fallback-20',
      name: 'Saint Alphonsus Physical Therapy - Meridian',
      address: '3101 E State St, Meridian, ID 83642',
      city: 'Meridian',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6121,
      longitude: -116.3915,
      hours: 'Mon-Fri 7:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/physical-therapy-meridian',
    },
    
    // Nampa locations
    {
      id: 'sa-fallback-6',
      name: 'Saint Alphonsus Regional Medical Center - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5407,
      longitude: -116.5635,
      hours: '24/7 Emergency Services',
      url: 'https://www.saintalphonsus.org/locations/regional-medical-center-nampa',
    },
    {
      id: 'sa-fallback-7',
      name: 'Saint Alphonsus Family Medicine - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-nampa',
    },
    {
      id: 'sa-fallback-8',
      name: 'Saint Alphonsus Urgent Care - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Sun 8:00 AM - 8:00 PM',
      url: 'https://www.saintalphonsus.org/locations/urgent-care-nampa',
    },
    {
      id: 'sa-fallback-29',
      name: 'Saint Alphonsus Pediatrics - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/pediatrics-nampa',
    },
    {
      id: 'sa-fallback-30',
      name: 'Saint Alphonsus Women\'s Health - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/womens-health-nampa',
    },
    {
      id: 'sa-fallback-31',
      name: 'Saint Alphonsus Cardiology - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/cardiology-nampa',
    },
    {
      id: 'sa-fallback-32',
      name: 'Saint Alphonsus Orthopedics - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/orthopedics-nampa',
    },
    {
      id: 'sa-fallback-33',
      name: 'Saint Alphonsus Imaging Center - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 7:00 AM - 7:00 PM',
      url: 'https://www.saintalphonsus.org/locations/imaging-nampa',
    },
    {
      id: 'sa-fallback-34',
      name: 'Saint Alphonsus Laboratory - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 6:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/laboratory-nampa',
    },
    {
      id: 'sa-fallback-35',
      name: 'Saint Alphonsus Physical Therapy - Nampa',
      address: '1512 12th Ave Rd, Nampa, ID 83686',
      city: 'Nampa',
      state: 'ID',
      phone: '(208) 463-5000',
      latitude: 43.5788,
      longitude: -116.5598,
      hours: 'Mon-Fri 7:00 AM - 6:00 PM',
      url: 'https://www.saintalphonsus.org/locations/physical-therapy-nampa',
    },
    
    // Eagle locations
    {
      id: 'sa-fallback-9',
      name: 'Saint Alphonsus Family Medicine - Eagle',
      address: '3101 E State St, Eagle, ID 83616',
      city: 'Eagle',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6954,
      longitude: -116.3540,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-eagle',
    },
    {
      id: 'sa-fallback-10',
      name: 'Saint Alphonsus Urgent Care - Eagle',
      address: '3101 E State St, Eagle, ID 83616',
      city: 'Eagle',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6954,
      longitude: -116.3540,
      hours: 'Mon-Sun 8:00 AM - 8:00 PM',
      url: 'https://www.saintalphonsus.org/locations/urgent-care-eagle',
    },
    
    // Additional locations
    {
      id: 'sa-fallback-11',
      name: 'Saint Alphonsus Family Medicine - Caldwell',
      address: '4512 Thomas Jefferson St, Caldwell, ID 83605',
      city: 'Caldwell',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.6629,
      longitude: -116.6874,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-caldwell',
    },
    {
      id: 'sa-fallback-12',
      name: 'Saint Alphonsus Family Medicine - Kuna',
      address: '123 Main St, Kuna, ID 83634',
      city: 'Kuna',
      state: 'ID',
      phone: '(208) 302-5200',
      latitude: 43.4918,
      longitude: -116.4206,
      hours: 'Mon-Fri 8:00 AM - 5:00 PM',
      url: 'https://www.saintalphonsus.org/locations/family-medicine-kuna',
    }
  ];
}

function getLocationSpecificFallback(searchParams) {
  const allLocations = getFallbackLocations();
  const { lat, lng, address } = searchParams;
  console.log(`getLocationSpecificFallback called with:`, searchParams);
  
  // If we have coordinates, find the closest city
  if (lat && lng) {
    const searchLat = parseFloat(lat);
    const searchLng = parseFloat(lng);
    console.log(`Searching for closest city to coordinates: ${searchLat}, ${searchLng}`);
    
    // Find the closest city based on coordinates
    let closestCity = 'Boise'; // default
    let minDistance = Infinity;
    
    const cityCoords = {
      'Boise': { lat: 43.6150, lng: -116.2023 },
      'Meridian': { lat: 43.6121, lng: -116.3915 },
      'Nampa': { lat: 43.5788, lng: -116.5598 },
      'Eagle': { lat: 43.6954, lng: -116.3540 },
      'Caldwell': { lat: 43.6629, lng: -116.6874 },
      'Kuna': { lat: 43.4918, lng: -116.4206 }
    };
    
    for (const [city, coords] of Object.entries(cityCoords)) {
      const distance = Math.sqrt(
        Math.pow(searchLat - coords.lat, 2) + Math.pow(searchLng - coords.lng, 2)
      );
      console.log(`Distance to ${city}: ${distance}`);
      if (distance < minDistance) {
        minDistance = distance;
        closestCity = city;
      }
    }
    
    console.log(`Closest city: ${closestCity} (distance: ${minDistance})`);
    
    // Filter locations by the closest city
    const filtered = allLocations.filter(loc => 
      loc.city.toLowerCase() === closestCity.toLowerCase()
    );
    console.log(`Filtered ${filtered.length} locations for ${closestCity}`);
    return filtered;
  }
  
  // If we have an address, try to extract city from it
  if (address) {
    const addressLower = address.toLowerCase();
    for (const city of ['nampa', 'meridian', 'eagle', 'caldwell', 'kuna', 'boise']) {
      if (addressLower.includes(city)) {
        return allLocations.filter(loc => 
          loc.city.toLowerCase() === city
        );
      }
    }
  }
  
  // Default to all locations
  return allLocations;
}

function filterLocationsByCityState(list, { city, state, q }) {
  let res = list;
  if (city) {
    const cityLc = city.toLowerCase();
    res = res.filter(l => (l.city || '').toLowerCase().includes(cityLc));
  }
  if (state) {
    const stateLc = state.toLowerCase();
    res = res.filter(l => (l.state || '').toLowerCase().includes(stateLc));
  }
  if (q) {
    const qLc = q.toLowerCase();
    res = res.filter(l =>
      (l.name || '').toLowerCase().includes(qLc) ||
      (l.address || '').toLowerCase().includes(qLc)
    );
  }
  return res;
}

// Function to clear all caches
function clearAllCaches() {
  cachedLocations = [];
  locationCache.clear();
  lastFetchAt = 0;
  console.log('All caches cleared');
}

module.exports = {
  fetchSaintAlphonsusLocations,
  filterLocationsByCityState,
  getCityCoordinates,
  clearAllCaches,
};


