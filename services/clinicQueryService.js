'use strict';

const Clinic = require('../models/Clinic');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSearchLocation(search) {
  if (!search) return { city: null, state: null };
  const parts = String(search).split(',').map((s) => s.trim());
  let city = parts[0] || null;
  let state = parts[1] || null;
  if (state) {
    state = state.replace(/,$/, '').trim();
    if (state.toUpperCase() === 'USA') state = parts.length >= 3 ? parts[1] : null;
    if (state && state.length > 3) {
      const map = {
        idaho: 'ID',
        california: 'CA',
        texas: 'TX',
        florida: 'FL',
        washington: 'WA',
      };
      const abbr = map[state.toLowerCase()];
      if (abbr) state = abbr;
    }
    if (state && state.length <= 3) state = state.toUpperCase();
  }
  return { city, state };
}

function serializeClinic(doc) {
  const c = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(c._id || c.id),
    name: c.name || '',
    address: c.address || '',
    phone: c.phone || '',
    hours: c.hours || '',
    latitude: c.latitude ?? 0,
    longitude: c.longitude ?? 0,
    description: c.description || '',
    rating: c.rating ?? 0,
    acceptingNewPatients: c.acceptingNewPatients !== false,
    openNow: c.openNow !== false,
    offersReferrals: c.offersReferrals !== false,
    imageUrl: c.imageUrl || '',
    website: c.website || '',
    city: c.city || '',
    state: c.state || '',
    type: c.type || 'primary_care',
    services: Array.isArray(c.services) ? c.services : [],
    specialties: Array.isArray(c.specialties) ? c.specialties : [],
    isPublished: c.isPublished !== false,
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildFilter(query) {
  const {
    city,
    state,
    type = 'primary_care',
    q,
    search,
    acceptingNew,
    openNow,
    referrals,
    nationwide,
  } = query;

  const filter = { isPublished: { $ne: false } };
  if (type) filter.type = type;

  let parsedCity = city;
  let parsedState = state;
  if (search) {
    const parsed = parseSearchLocation(search);
    parsedCity = parsed.city || parsedCity;
    parsedState = parsed.state || parsedState;
  }

  if (!nationwide || String(nationwide) === 'false') {
    if (parsedCity) filter.city = new RegExp(`^${escapeRegex(parsedCity)}$`, 'i');
    if (parsedState) filter.state = new RegExp(`^${escapeRegex(parsedState)}$`, 'i');
  }

  if (acceptingNew !== undefined) {
    filter.acceptingNewPatients = acceptingNew === 'true' || acceptingNew === true;
  }
  if (openNow !== undefined) {
    filter.openNow = openNow === 'true' || openNow === true;
  }
  if (referrals !== undefined) {
    filter.offersReferrals = referrals === 'true' || referrals === true;
  }

  const text = (q || search || '').trim();
  if (text && !search?.includes(',')) {
    filter.$or = [
      { name: new RegExp(escapeRegex(text), 'i') },
      { address: new RegExp(escapeRegex(text), 'i') },
      { city: new RegExp(escapeRegex(text), 'i') },
      { state: new RegExp(escapeRegex(text), 'i') },
      { description: new RegExp(escapeRegex(text), 'i') },
    ];
  }

  return filter;
}

async function listClinics(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;
  const radiusKm = Number(query.radius) || 50;
  const lat = query.lat != null ? Number(query.lat) : null;
  const lng = query.lng != null ? Number(query.lng) : null;

  const filter = buildFilter(query);
  let rows = await Clinic.find(filter).sort({ rating: -1, name: 1 }).skip(skip).limit(limit * 3);

  let mapped = rows.map(serializeClinic);

  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    mapped = mapped
      .map((c) => ({
        ...c,
        distanceKm:
          c.latitude && c.longitude
            ? haversineKm(lat, lng, c.latitude, c.longitude)
            : null,
      }))
      .filter((c) => c.distanceKm == null || c.distanceKm <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  return mapped.slice(0, limit);
}

async function searchClinics(query = {}) {
  const { q, lat, lng, radius = 100, limit = 50 } = query;
  if (!q || !String(q).trim()) {
    return { error: 'Search query is required', status: 400 };
  }
  const data = await listClinics({
    ...query,
    q: String(q).trim(),
    radius,
    limit,
    lat,
    lng,
  });
  return { data };
}

async function getClinicById(id) {
  if (!id || !/^[a-f0-9]{24}$/i.test(String(id))) return null;
  const doc = await Clinic.findById(id);
  if (!doc || doc.isPublished === false) return null;
  return serializeClinic(doc);
}

function publicDefaults() {
  return {
    defaultSearch: process.env.CLINIC_DEFAULT_SEARCH || 'Boise, ID, USA',
    defaultStateLabel: process.env.CLINIC_DEFAULT_STATE || 'Idaho',
    defaultCityLabel: process.env.CLINIC_DEFAULT_CITY || 'Boise',
    careTypes: ['Urgent Care', 'Family medicine', 'Primary Care'],
  };
}

module.exports = {
  listClinics,
  searchClinics,
  getClinicById,
  serializeClinic,
  publicDefaults,
  buildFilter,
};
