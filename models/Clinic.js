const mongoose = require('mongoose');

const clinicSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  hours: { type: String, trim: true },
  latitude: { type: Number, required: true, index: true },
  longitude: { type: Number, required: true, index: true },
  description: { type: String, trim: true },
  rating: { type: Number, default: 0 },
  city: { type: String, index: true, trim: true },
  type: { type: String, default: 'primary_care', index: true },
  acceptingNewPatients: { type: Boolean, default: true, index: true },
  openNow: { type: Boolean, default: true, index: true },
  offersReferrals: { type: Boolean, default: true, index: true },
  imageUrl: { type: String, trim: true },
}, { timestamps: true });

clinicSchema.index({ name: 'text', description: 'text', address: 'text' });

module.exports = mongoose.model('Clinic', clinicSchema);


