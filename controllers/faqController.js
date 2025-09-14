const FAQ = require('../models/FAQ');

class FAQController {
  // Get all active FAQs, optionally filtered by category
  static async getFAQs(req, res) {
    try {
      const { category, search } = req.query;
      
      let query = { isActive: true };
      
      // Filter by category if provided
      if (category && category !== 'all') {
        query.category = category;
      }
      
      // Text search if provided
      if (search) {
        query.$text = { $search: search };
      }
      
      const faqs = await FAQ.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .select('-__v');
      
      // Group FAQs by category for better organization
      const groupedFAQs = faqs.reduce((acc, faq) => {
        if (!acc[faq.category]) {
          acc[faq.category] = [];
        }
        acc[faq.category].push(faq);
        return acc;
      }, {});
      
      res.status(200).json({
        success: true,
        data: {
          faqs: groupedFAQs,
          total: faqs.length,
          categories: Object.keys(groupedFAQs)
        }
      });
    } catch (error) {
      console.error('Error fetching FAQs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch FAQs',
        error: error.message
      });
    }
  }
  
  // Get FAQ categories
  static async getCategories(req, res) {
    try {
      const categories = await FAQ.distinct('category', { isActive: true });
      
      const categoryInfo = {
        general: { name: 'General', icon: 'help', count: 0 },
        account: { name: 'Account & Profile', icon: 'person', count: 0 },
        medications: { name: 'Medications', icon: 'medication', count: 0 },
        symptoms: { name: 'Symptoms', icon: 'health', count: 0 },
        technical: { name: 'Technical Support', icon: 'settings', count: 0 },
        billing: { name: 'Billing & Payments', icon: 'payment', count: 0 }
      };
      
      // Get count for each category
      for (const category of categories) {
        const count = await FAQ.countDocuments({ 
          category, 
          isActive: true 
        });
        if (categoryInfo[category]) {
          categoryInfo[category].count = count;
        }
      }
      
      res.status(200).json({
        success: true,
        data: categoryInfo
      });
    } catch (error) {
      console.error('Error fetching FAQ categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch FAQ categories',
        error: error.message
      });
    }
  }
  
  // Create a new FAQ (Admin only)
  static async createFAQ(req, res) {
    try {
      const { question, answer, category, priority, tags } = req.body;
      
      const faq = new FAQ({
        question,
        answer,
        category: category || 'general',
        priority: priority || 0,
        tags: tags || []
      });
      
      await faq.save();
      
      res.status(201).json({
        success: true,
        message: 'FAQ created successfully',
        data: faq
      });
    } catch (error) {
      console.error('Error creating FAQ:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create FAQ',
        error: error.message
      });
    }
  }
  
  // Update an FAQ (Admin only)
  static async updateFAQ(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const faq = await FAQ.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: Date.now() },
        { new: true, runValidators: true }
      );
      
      if (!faq) {
        return res.status(404).json({
          success: false,
          message: 'FAQ not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'FAQ updated successfully',
        data: faq
      });
    } catch (error) {
      console.error('Error updating FAQ:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update FAQ',
        error: error.message
      });
    }
  }
  
  // Delete an FAQ (Admin only)
  static async deleteFAQ(req, res) {
    try {
      const { id } = req.params;
      
      const faq = await FAQ.findByIdAndDelete(id);
      
      if (!faq) {
        return res.status(404).json({
          success: false,
          message: 'FAQ not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'FAQ deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting FAQ:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete FAQ',
        error: error.message
      });
    }
  }
}

module.exports = FAQController;
