const Category = require('../models/Category');

class CategoryController {
  // Get all active categories
  static async getCategories(req, res) {
    try {
      const categories = await Category.find({ isActive: true })
        .sort({ sortOrder: 1, name: 1 })
        .select('name description color icon');

      res.json({ categories });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Failed to get categories' });
    }
  }

  // Get category by ID
  static async getCategory(req, res) {
    try {
      const category = await Category.findById(req.params.id);
      
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ category });
    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({ error: 'Failed to get category' });
    }
  }

  // Create new category (Admin only)
  static async createCategory(req, res) {
    try {
      const category = new Category(req.body);
      await category.save();

      res.status(201).json({
        message: 'Category created successfully',
        category
      });
    } catch (error) {
      console.error('Create category error:', error);
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Category already exists' });
      }
      res.status(500).json({ error: 'Failed to create category' });
    }
  }

  // Update category (Admin only)
  static async updateCategory(req, res) {
    try {
      const category = await Category.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({
        message: 'Category updated successfully',
        category
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({ error: 'Failed to update category' });
    }
  }

  // Delete category (Admin only)
  static async deleteCategory(req, res) {
    try {
      const category = await Category.findByIdAndDelete(req.params.id);

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({
        message: 'Category deleted successfully'
      });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  }
}

module.exports = CategoryController; 