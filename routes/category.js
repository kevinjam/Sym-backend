const express = require('express');
const { authenticateToken, requireDoctor } = require('../middleware/auth');
const CategoryController = require('../controllers/categoryController');

const router = express.Router();

/**
 * @swagger
 * /api/category:
 *   get:
 *     summary: Get all active categories
 *     tags: [Category]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/', CategoryController.getCategories);

/**
 * @swagger
 * /api/category/{id}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 */
router.get('/:id', CategoryController.getCategory);

// Admin-only routes (require authentication)
router.use(authenticateToken);
router.use(requireDoctor);

/**
 * @swagger
 * /api/category:
 *   post:
 *     summary: Create new category (Admin only)
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *               icon:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category created successfully
 */
router.post('/', CategoryController.createCategory);

/**
 * @swagger
 * /api/category/{id}:
 *   put:
 *     summary: Update category (Admin only)
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Category updated successfully
 */
router.put('/:id', CategoryController.updateCategory);

/**
 * @swagger
 * /api/category/{id}:
 *   delete:
 *     summary: Delete category (Admin only)
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted successfully
 */
router.delete('/:id', CategoryController.deleteCategory);

module.exports = router; 