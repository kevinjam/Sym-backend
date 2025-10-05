const axios = require('axios');
const Clinic = require('../models/Clinic');
const { fetchSaintAlphonsusLocations, filterLocationsByCityState, getCityCoordinates, clearAllCaches } = require('../utils/saintAlphonsusScraper');

// Minimal NPI Registry fetch for clinics/providers (organization endpoint)
const fetchClinicsFromNPI = async ({ city, state, specialty, limit = 20 }) => {
  try {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (state) params.set('state', state);
    if (specialty) params.set('taxonomy_description', specialty);
    params.set('limit', String(limit));
    // organization=Y to prefer organizations/clinics
    params.set('enumeration_type', 'NPI-2');

    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&${params.toString()}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const results = resp.data?.results || [];
    return results.map((r) => {
      const addr = (r.addresses || []).find(a => a.address_purpose === 'LOCATION') || r.addresses?.[0] || {};
      return {
        id: r.number?.toString() || '',
        name: r.basic?.organization_name || r.basic?.name || 'Clinic',
        address: `${addr.address_1 || ''} ${addr.address_2 || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}`.replace(/\s+/g, ' ').trim(),
        phone: addr.telephone_number || '',
        hours: '',
        latitude: 0,
        longitude: 0,
        description: (r.taxonomies?.[0]?.desc) || '',
        rating: 0,
      };
    });
  } catch (e) {
    return [];
  }
};

// GET /api/clinics
const getClinics = async (req, res) => {
  try {
    const {
      city = 'Boise',
      state = 'ID',
      type = 'primary_care',
      radius = 20,
      q,
      search, // free-text (e.g., "Boise, ID, USA")
      specialty,
      open_now,
      acceptingNew,
      openNow,
      referrals,
      lat,
      lng,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { type };
    if (city) filter.city = new RegExp(`^${city}$`, 'i');
    if (acceptingNew !== undefined) filter.acceptingNewPatients = acceptingNew === 'true';
    if (openNow !== undefined) filter.openNow = openNow === 'true';
    if (open_now !== undefined) filter.openNow = open_now === 'true';
    if (referrals !== undefined) filter.offersReferrals = referrals === 'true';

    if (q) {
      filter.$text = { $search: q };
    }

    const skip = (Number(page) - 1) * Number(limit);

    let clinics = await Clinic.find(filter)
      .sort({ rating: -1, name: 1 })
      .skip(skip)
      .limit(Number(limit));

    // Try external sources (prioritize Saint Alphonsus scraper)
    const source = (process.env.CLINIC_SOURCE || 'saintalphonsus').toLowerCase();

    // Saint Alphonsus scraper source (primary)
    if (source === 'saintalphonsus') {
      try {
        // Parse address-like search to city/state if provided
        // ALWAYS use search parameter if provided (it takes precedence over city/state)
        let parsedCity = city;
        let parsedState = state;
        if (search) {
          console.log(`Parsing search string: "${search}"`);
          const parts = String(search).split(',').map(s => s.trim());
          console.log(`Split parts:`, parts);
          if (parts.length >= 2) {
            parsedCity = parts[0] || parsedCity;
            const statePart = parts[1].split(' ')[0];
            if (statePart && statePart.length <= 3) parsedState = statePart;
            console.log(`Extracted city: "${parsedCity}", state: "${parsedState}"`);
          }
        }
        
        console.log(`Parsed city: ${parsedCity}, state: ${parsedState}, search: ${search}`);

        // Build search parameters for location-specific scraping
        const searchParams = {};
        
        // Use provided coordinates or get them from city name
        let searchLat = lat;
        let searchLng = lng;
        
        if (!searchLat || !searchLng) {
          const coords = getCityCoordinates(parsedCity);
          if (coords) {
            searchLat = coords.lat;
            searchLng = coords.lng;
            console.log(`Got coordinates for ${parsedCity}: lat=${searchLat}, lng=${searchLng}`);
          } else {
            console.log(`No coordinates found for city: ${parsedCity}`);
          }
        }
        
        if (searchLat && searchLng) {
          searchParams.lat = searchLat;
          searchParams.lng = searchLng;
          searchParams.address = search || `${parsedCity}, ${parsedState}`;
          searchParams.distance = radius || '50';
          console.log(`Location-specific search params:`, searchParams);
        } else {
          console.log(`No coordinates available for location-specific search`);
        }
        
        // Force refresh for location-specific searches
        const forceRefresh = !!(searchParams.lat && searchParams.lng);
        console.log(`📍 Calling scraper with forceRefresh: ${forceRefresh}`);
        console.log(`📍 searchParams keys:`, Object.keys(searchParams));
        console.log(`📍 searchParams:`, JSON.stringify(searchParams, null, 2));
        const locations = await fetchSaintAlphonsusLocations(forceRefresh, searchParams);
        console.log(`📍 Scraper returned ${locations.length} locations`);
        console.log(`📍 First location city:`, locations[0]?.city);
        
        // If location-specific search, don't filter further (scraper already filtered)
        const filtered = (searchParams.lat && searchParams.lng) 
          ? locations 
          : filterLocationsByCityState(locations, { city: parsedCity, state: parsedState, q: q || search });
        console.log(`After filtering: ${filtered.length} locations`);
        
        if (filtered.length) {
          const mappedFromSA = filtered.map((l) => ({
            id: l.id,
            name: l.name,
            address: l.address,
            phone: l.phone || '',
            hours: l.hours || 'Contact clinic for hours',
            latitude: l.latitude || 0,
            longitude: l.longitude || 0,
            description: `Saint Alphonsus Health System location in ${l.city}, ${l.state}`,
            rating: 4.2, // Default rating for Saint Alphonsus
            acceptingNewPatients: true,
            openNow: true,
            offersReferrals: true,
            city: l.city || '',
            state: l.state || '',
            website: l.url || '',
            imageUrl: '',
            services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
            specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
          }));
          return res.json({ success: true, data: mappedFromSA });
        }
      } catch (error) {
        console.error('Saint Alphonsus scraper error:', error);
        // Fall through to other sources
      }
    }

    // If no local data and scraper didn't work, try other sources
    if (!clinics.length) {

      // Try NPI Registry if configured
      if (source === 'npi') {
        const npiResults = await fetchClinicsFromNPI({ city, state, specialty: specialty || q, limit });
        if (npiResults.length) {
          return res.json({ success: true, data: npiResults });
        }
      }

      // Try Google Places if API key is available
      if (process.env.GOOGLE_PLACES_API_KEY) {
        const centerLat = lat ? Number(lat) : 43.6150;
        const centerLng = lng ? Number(lng) : -116.2023;
        const meters = Number(radius) * 1000;
        const keyword = type === 'primary_care' ? 'primary care clinic' : 'clinic';

        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${centerLat},${centerLng}&radius=${meters}&keyword=${encodeURIComponent(keyword)}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
        const resp = await axios.get(url);
        clinics = (resp.data.results || []).map((r) => ({
          id: r.place_id,
          name: r.name,
          address: r.vicinity || '',
          phone: '',
          hours: '',
          latitude: r.geometry?.location?.lat,
          longitude: r.geometry?.location?.lng,
          description: r.types?.join(', ') || '',
          rating: r.rating || 0,
        }));

        if (clinics.length) {
          return res.json({ success: true, data: clinics });
        }
      }

      // Final fallback: return Saint Alphonsus and curated Boise clinics
      const fallback = [
        {
          id: 'saint-alphonsus-1',
          name: 'Saint Alphonsus Family Medicine - Boise',
          address: '6533 W Emerald St, Boise, ID 83704',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6167,
          longitude: -116.2000,
          description: 'Comprehensive family medicine services with same-day appointments available. Part of Saint Alphonsus Health System.',
          rating: 4.5,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-boise',
          city: 'Boise',
          state: 'ID'
        },
        {
          id: 'saint-alphonsus-2',
          name: 'Saint Alphonsus Medical Center - Boise',
          address: '1055 N Curtis Rd, Boise, ID 83706',
          phone: '(208) 367-2121',
          hours: '24/7 Emergency Services',
          latitude: 43.6155,
          longitude: -116.2033,
          description: 'Full-service medical center with emergency services, primary care, and specialty services.',
          rating: 4.3,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/medical-center-boise',
          city: 'Boise',
          state: 'ID'
        },
        {
          id: 'saint-alphonsus-3',
          name: 'Saint Alphonsus Family Medicine - Meridian',
          address: '3230 E Louise Dr, Meridian, ID 83642',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6138,
          longitude: -116.2102,
          description: 'Family medicine practice serving Meridian and surrounding communities with comprehensive primary care.',
          rating: 4.6,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-meridian',
          city: 'Meridian',
          state: 'ID'
        },
        {
          id: 'boise-fallback-1',
          name: 'Boise Family Medicine Clinic',
          address: '123 Main St, Boise, ID 83702',
          phone: '(208) 555-0111',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6167,
          longitude: -116.2000,
          description: 'Primary care focused on long-term patient relationships and preventive care. Referrals to specialists available.',
          rating: 4.6,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: '',
          city: 'Boise',
          state: 'ID'
        }
      ];
      return res.json({ success: true, data: fallback });
    }

    const mapped = clinics.map((c) => ({
      id: String(c._id),
      name: c.name,
      address: c.address,
      phone: c.phone || '',
      hours: c.hours || '',
      latitude: c.latitude,
      longitude: c.longitude,
      description: c.description || '',
      rating: c.rating || 0,
      acceptingNewPatients: c.acceptingNewPatients,
      openNow: c.openNow,
      offersReferrals: c.offersReferrals,
      imageUrl: c.imageUrl || '',
    }));

    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('Error fetching clinics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch clinics' });
  }
};

// GET /api/clinics/:id
const getClinicById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's a Saint Alphonsus clinic ID (including fallback IDs)
    if (id.startsWith('saint-alphonsus-') || id.startsWith('sa-fallback-')) {
      const saintAlphonsusClinics = [
        {
          id: 'saint-alphonsus-1',
          name: 'Saint Alphonsus Family Medicine - Boise',
          address: '6533 W Emerald St, Boise, ID 83704',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6167,
          longitude: -116.2000,
          description: 'Comprehensive family medicine services with same-day appointments available. Part of Saint Alphonsus Health System.',
          rating: 4.5,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-boise',
          city: 'Boise',
          state: 'ID',
          services: ['Primary Care', 'Preventive Medicine', 'Same-day Appointments', 'Chronic Disease Management'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        },
        {
          id: 'saint-alphonsus-2',
          name: 'Saint Alphonsus Medical Center - Boise',
          address: '1055 N Curtis Rd, Boise, ID 83706',
          phone: '(208) 367-2121',
          hours: '24/7 Emergency Services',
          latitude: 43.6155,
          longitude: -116.2033,
          description: 'Full-service medical center with emergency services, primary care, and specialty services.',
          rating: 4.3,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/medical-center-boise',
          city: 'Boise',
          state: 'ID',
          services: ['Emergency Care', 'Primary Care', 'Specialty Services', 'Surgery', 'Imaging'],
          specialties: ['Emergency Medicine', 'Cardiology', 'Orthopedics', 'Oncology', 'Neurology']
        },
        {
          id: 'saint-alphonsus-3',
          name: 'Saint Alphonsus Family Medicine - Meridian',
          address: '3230 E Louise Dr, Meridian, ID 83642',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6138,
          longitude: -116.2102,
          description: 'Family medicine practice serving Meridian and surrounding communities with comprehensive primary care.',
          rating: 4.6,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-meridian',
          city: 'Meridian',
          state: 'ID',
          services: ['Primary Care', 'Preventive Medicine', 'Chronic Disease Management', 'Wellness Programs'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Women\'s Health']
        },
        // Fallback clinic data from scraper
        {
          id: 'sa-fallback-1',
          name: 'Saint Alphonsus Family Medicine - Boise',
          address: '6533 W Emerald St, Boise, ID 83704',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6167,
          longitude: -116.2000,
          description: 'Saint Alphonsus Health System location in Boise, ID',
          rating: 4.2,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-boise',
          city: 'Boise',
          state: 'ID',
          services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        },
        {
          id: 'sa-fallback-2',
          name: 'Saint Alphonsus Medical Center - Boise',
          address: '1055 N Curtis Rd, Boise, ID 83706',
          phone: '(208) 367-2121',
          hours: '24/7 Emergency Services',
          latitude: 43.6155,
          longitude: -116.2033,
          description: 'Saint Alphonsus Health System location in Boise, ID',
          rating: 4.2,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/medical-center-boise',
          city: 'Boise',
          state: 'ID',
          services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        },
        {
          id: 'sa-fallback-3',
          name: 'Saint Alphonsus Family Medicine - Meridian',
          address: '3230 E Louise Dr, Meridian, ID 83642',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6138,
          longitude: -116.2102,
          description: 'Saint Alphonsus Health System location in Meridian, ID',
          rating: 4.2,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-meridian',
          city: 'Meridian',
          state: 'ID',
          services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        },
        {
          id: 'sa-fallback-4',
          name: 'Saint Alphonsus Regional Medical Center - Nampa',
          address: '1512 12th Ave Rd, Nampa, ID 83686',
          phone: '(208) 463-5000',
          hours: '24/7 Emergency Services',
          latitude: 43.5407,
          longitude: -116.5635,
          description: 'Saint Alphonsus Health System location in Nampa, ID',
          rating: 4.2,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/regional-medical-center-nampa',
          city: 'Nampa',
          state: 'ID',
          services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        },
        {
          id: 'sa-fallback-5',
          name: 'Saint Alphonsus Family Medicine - Eagle',
          address: '3101 E State St, Eagle, ID 83616',
          phone: '(208) 302-5200',
          hours: 'Mon-Fri 8:00 AM - 5:00 PM',
          latitude: 43.6954,
          longitude: -116.3540,
          description: 'Saint Alphonsus Health System location in Eagle, ID',
          rating: 4.2,
          acceptingNewPatients: true,
          openNow: true,
          offersReferrals: true,
          imageUrl: '',
          website: 'https://www.saintalphonsus.org/locations/family-medicine-eagle',
          city: 'Eagle',
          state: 'ID',
          services: ['Primary Care', 'Family Medicine', 'Preventive Care'],
          specialties: ['Family Medicine', 'Internal Medicine', 'Pediatrics']
        }
      ];
      
      const clinic = saintAlphonsusClinics.find(c => c.id === id);
      if (clinic) {
        return res.json({ success: true, data: clinic });
      }
    }
    
    // Only try to find in database if ID looks like a valid MongoDB ObjectId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const clinic = await Clinic.findById(id);
      if (clinic) {
        const mapped = {
          id: String(clinic._id),
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone || '',
          hours: clinic.hours || '',
          latitude: clinic.latitude,
          longitude: clinic.longitude,
          description: clinic.description || '',
          rating: clinic.rating || 0,
          acceptingNewPatients: clinic.acceptingNewPatients,
          openNow: clinic.openNow,
          offersReferrals: clinic.offersReferrals,
          imageUrl: clinic.imageUrl || '',
          website: '',
          city: clinic.city || '',
          state: clinic.state || '',
          services: [],
          specialties: []
        };
        return res.json({ success: true, data: mapped });
      }
    }
    
    return res.status(404).json({ success: false, error: 'Clinic not found' });
  } catch (error) {
    console.error('Error fetching clinic by ID:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch clinic details' });
  }
};

// Test endpoint for debugging scraper
const testScraper = async (req, res) => {
  try {
    const { city = 'Nampa' } = req.query;
    console.log(`Testing scraper for city: ${city}`);
    
    const coords = getCityCoordinates(city);
    console.log(`Coordinates for ${city}:`, coords);
    
    const searchParams = {
      lat: coords?.lat,
      lng: coords?.lng,
      address: `${city}, ID`,
      distance: '50'
    };
    
    console.log('Search params:', searchParams);
    
    const locations = await fetchSaintAlphonsusLocations(true, searchParams);
    console.log(`Found ${locations.length} locations`);
    
    res.json({
      success: true,
      city,
      coords,
      searchParams,
      locations: locations.map(l => ({ name: l.name, city: l.city, address: l.address }))
    });
  } catch (error) {
    console.error('Test scraper error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Clear cache endpoint for testing
const clearCache = async (req, res) => {
  try {
    clearAllCaches();
    res.json({ success: true, message: 'All caches cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getClinics, getClinicById, testScraper, clearCache };


