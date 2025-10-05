const axios = require('axios');

// GET /api/providers
const getProviders = async (req, res) => {
  try {
    const { city = 'Boise', state = 'ID', specialty, limit = 20 } = req.query;
    const source = (process.env.PROVIDER_SOURCE || 'npi').toLowerCase();

    if (source === 'npi') {
      const list = await fetchProvidersFromNPI({ city, state, specialty, limit });
      return res.json({ success: true, data: list });
    }

    // Default empty
    return res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch providers' });
  }
};

const fetchProvidersFromNPI = async ({ city, state, specialty, limit }) => {
  try {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (state) params.set('state', state);
    if (specialty) params.set('taxonomy_description', specialty);
    params.set('limit', String(limit));
    params.set('enumeration_type', 'NPI-1');

    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&${params.toString()}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const results = resp.data?.results || [];
    return results.map((r) => {
      const addr = (r.addresses || []).find(a => a.address_purpose === 'LOCATION') || r.addresses?.[0] || {};
      return {
        id: r.number?.toString() || '',
        name: `${r.basic?.first_name || ''} ${r.basic?.last_name || ''}`.trim(),
        type: 'doctor',
        specialty: r.taxonomies?.[0]?.desc || '',
        address: `${addr.address_1 || ''} ${addr.address_2 || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}`.replace(/\s+/g, ' ').trim(),
        phone: addr.telephone_number || '',
        city: addr.city || '',
        state: addr.state || '',
        latitude: 0,
        longitude: 0,
        hours: '',
        website: '',
      };
    });
  } catch (e) {
    return [];
  }
};

module.exports = { getProviders };


