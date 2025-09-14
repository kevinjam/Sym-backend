const Doctor = require('../models/Doctor');

class DoctorController {
  // Get all doctors with search, filtering, and pagination
  static async getDoctors(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        specialty,
        city,
        state,
        minRating = 0,
        maxFee,
        available,
        sortBy = 'averageRating',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      let query = { isActive: true };

      // Search functionality
      if (search) {
        query.$text = { $search: search };
      }

      // Filter by specialty
      if (specialty) {
        query.specialty = { $regex: specialty, $options: 'i' };
      }

      // Filter by location
      if (city) {
        query['address.city'] = { $regex: city, $options: 'i' };
      }
      if (state) {
        query['address.state'] = { $regex: state, $options: 'i' };
      }

      // Filter by rating
      if (minRating) {
        query.averageRating = { $gte: parseFloat(minRating) };
      }

      // Filter by consultation fee
      if (maxFee) {
        query.consultationFee = { $lte: parseFloat(maxFee) };
      }

      // Filter by availability
      if (available === 'true') {
        query.isAvailable = true;
        query.acceptsNewPatients = true;
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const doctors = await Doctor.find(query)
        .select('-reviews -education -certifications -insuranceAccepted -languages')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await Doctor.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          doctors,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error('Error fetching doctors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctors',
        error: error.message
      });
    }
  }

  // Get doctor by ID
  static async getDoctorById(req, res) {
    try {
      const { id } = req.params;

      const doctor = await Doctor.findById(id);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      res.status(200).json({
        success: true,
        data: doctor
      });
    } catch (error) {
      console.error('Error fetching doctor:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctor',
        error: error.message
      });
    }
  }

  // Get doctor specialties
  static async getSpecialties(req, res) {
    try {
      const specialties = await Doctor.distinct('specialty', { isActive: true });
      
      // Sort specialties alphabetically
      const sortedSpecialties = specialties.sort();

      res.status(200).json({
        success: true,
        data: sortedSpecialties
      });
    } catch (error) {
      console.error('Error fetching specialties:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch specialties',
        error: error.message
      });
    }
  }

  // Get popular doctors (highest rated)
  static async getPopularDoctors(req, res) {
    try {
      const { limit = 5 } = req.query;

      const doctors = await Doctor.find({ 
        isActive: true, 
        averageRating: { $gte: 4.0 },
        totalReviews: { $gte: 5 }
      })
        .select('-reviews -education -certifications -insuranceAccepted -languages')
        .sort({ averageRating: -1, totalReviews: -1 })
        .limit(parseInt(limit))
        .exec();

      res.status(200).json({
        success: true,
        data: doctors
      });
    } catch (error) {
      console.error('Error fetching popular doctors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch popular doctors',
        error: error.message
      });
    }
  }

  // Get doctors by specialty
  static async getDoctorsBySpecialty(req, res) {
    try {
      const { specialty } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const doctors = await Doctor.find({ 
        specialty: { $regex: specialty, $options: 'i' },
        isActive: true 
      })
        .select('-reviews -education -certifications -insuranceAccepted -languages')
        .sort({ averageRating: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await Doctor.countDocuments({ 
        specialty: { $regex: specialty, $options: 'i' },
        isActive: true 
      });

      res.status(200).json({
        success: true,
        data: {
          doctors,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching doctors by specialty:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctors by specialty',
        error: error.message
      });
    }
  }

  // Add a review for a doctor
  static async addReview(req, res) {
    try {
      const { id } = req.params;
      const { rating, comment } = req.body;
      const patientId = req.user.id;

      const doctor = await Doctor.findById(id);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      // Check if patient already reviewed this doctor
      const existingReview = doctor.reviews.find(
        review => review.patientId.toString() === patientId
      );

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this doctor'
        });
      }

      // Add new review
      doctor.reviews.push({
        patientId,
        rating,
        comment
      });

      // Update average rating and total reviews
      const totalRating = doctor.reviews.reduce((sum, review) => sum + review.rating, 0);
      doctor.averageRating = totalRating / doctor.reviews.length;
      doctor.totalReviews = doctor.reviews.length;

      await doctor.save();

      res.status(201).json({
        success: true,
        message: 'Review added successfully',
        data: {
          averageRating: doctor.averageRating,
          totalReviews: doctor.totalReviews
        }
      });
    } catch (error) {
      console.error('Error adding review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add review',
        error: error.message
      });
    }
  }

  // Get doctor reviews
  static async getDoctorReviews(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const doctor = await Doctor.findById(id)
        .populate('reviews.patientId', 'firstName lastName profilePicture')
        .select('reviews averageRating totalReviews');

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      // Paginate reviews
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      const paginatedReviews = doctor.reviews.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: {
          reviews: paginatedReviews,
          averageRating: doctor.averageRating,
          totalReviews: doctor.totalReviews,
          page: parseInt(page),
          pages: Math.ceil(doctor.reviews.length / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching doctor reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctor reviews',
        error: error.message
      });
    }
  }

  // Admin: Create a new doctor
  static async createDoctor(req, res) {
    try {
      const doctorData = req.body;
      
      const doctor = new Doctor(doctorData);
      await doctor.save();

      res.status(201).json({
        success: true,
        message: 'Doctor created successfully',
        data: doctor
      });
    } catch (error) {
      console.error('Error creating doctor:', error);
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Doctor with this email or license number already exists'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to create doctor',
        error: error.message
      });
    }
  }

  // Admin: Update doctor
  static async updateDoctor(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const doctor = await Doctor.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Doctor updated successfully',
        data: doctor
      });
    } catch (error) {
      console.error('Error updating doctor:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update doctor',
        error: error.message
      });
    }
  }

  // Admin: Delete doctor
  static async deleteDoctor(req, res) {
    try {
      const { id } = req.params;

      const doctor = await Doctor.findByIdAndDelete(id);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Doctor deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting doctor:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete doctor',
        error: error.message
      });
    }
  }
}

module.exports = DoctorController;