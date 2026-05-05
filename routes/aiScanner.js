const express = require('express');
const router = express.Router();
const { 
  scanMedicationOrSupplement,
  scanManualProductInfo,
  getScanHistory, 
  getScanResult, 
  deleteScanResult, 
  testAIScanner,
  uploadScanImages
} = require('../controllers/aiScannerController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: AI Scanner
 *   description: AI-powered medication and supplement scanner
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AiScanResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the scan result
 *         name:
 *           type: string
 *           description: Name of the medication or supplement
 *         category:
 *           type: string
 *           enum: [medication, supplement]
 *           description: Category of the product
 *         description:
 *           type: string
 *           description: Detailed description of the product
 *         ingredients:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: string
 *               unit:
 *                 type: string
 *               purpose:
 *                 type: string
 *         benefits:
 *           type: array
 *           items:
 *             type: string
 *           description: List of health benefits
 *         sideEffects:
 *           type: array
 *           items:
 *             type: string
 *           description: List of potential side effects
 *         confidence:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *           description: AI confidence score
 *         dosage:
 *           type: string
 *           description: Recommended dosage instructions
 *         manufacturer:
 *           type: string
 *           description: Manufacturer name
 *         warnings:
 *           type: string
 *           description: Important warnings
 *         interactions:
 *           type: string
 *           description: Drug interactions
 *         scannedAt:
 *           type: string
 *           format: date-time
 *           description: When the scan was performed
 *     
 *     PaginationInfo:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           description: Current page number
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *         total:
 *           type: integer
 *           description: Total number of items
 *         pages:
 *           type: integer
 *           description: Total number of pages
 *     
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Whether the request was successful
 *         data:
 *           type: object
 *           description: Response data
 *         error:
 *           type: string
 *           description: Error message if request failed
 *         message:
 *           type: string
 *           description: Success or info message
 */

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * Typed supplement/medication on POST /scan uses the same URL as image upload.
 * Do not rely only on req.is('application/json') — clients/proxies vary Content-Type.
 * Never treat multipart image uploads as manual (even if odd text fields appear).
 */
const routeManualJsonViaScan = (req, res, next) => {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return next();
  }

  const manualByQuery = String(req.query.mode || '').toLowerCase() === 'manual';

  const body = req.body;
  let manualByBody = false;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const rawName = body.productName;
    const rawDetails = body.details;
    const productName =
      typeof rawName === 'string' ? rawName : rawName != null ? String(rawName) : '';
    const details =
      typeof rawDetails === 'string' ? rawDetails : rawDetails != null ? String(rawDetails) : '';
    manualByBody = productName.trim().length > 0 && details.trim().length > 0;
  }

  if (manualByQuery || manualByBody) {
    return scanManualProductInfo(req, res);
  }
  next();
};

/**
 * @swagger
 * /api/ai-scanner/scan:
 *   post:
 *     summary: Scan medication or supplement image using AI
 *     description: Upload an image of a medication or supplement and get AI-powered analysis including ingredients, benefits, side effects, and more.
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 description: Front and back images of the product (up to 2 files, JPEG, PNG, GIF, WebP, 10MB each)
 *                 maxItems: 2
 *                 items:
 *                   type: string
 *                   format: binary
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Single image upload (legacy support; use images[] for best results)
 *     responses:
 *       200:
 *         description: Successfully analyzed medication/supplement
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AiScanResult'
 *       400:
 *         description: Bad request - invalid image or missing file
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       example: "No image file provided"
 *       401:
 *         description: Unauthorized - invalid or missing authentication token
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       example: "Failed to process image"
 */
router.post(
  '/scan',
  routeManualJsonViaScan,
  uploadScanImages,
  scanMedicationOrSupplement
);

/**
 * @swagger
 * /api/ai-scanner/scan-manual:
 *   post:
 *     summary: (Alias) Same as POST /scan with JSON body productName + details
 */
router.post('/scan-manual', scanManualProductInfo);

/**
 * @swagger
 * /api/ai-scanner/history:
 *   get:
 *     summary: Get AI scan history for the authenticated patient
 *     description: Retrieve paginated list of AI scan results for the authenticated user, with optional filtering by category.
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [all, medication, supplement]
 *           default: all
 *         description: Filter results by category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum confidence score filter
 *     responses:
 *       200:
 *         description: Successfully retrieved scan history
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AiScanResult'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationInfo'
 *       401:
 *         description: Unauthorized - invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get('/history', getScanHistory);

/**
 * @swagger
 * /api/ai-scanner/{id}:
 *   get:
 *     summary: Get detailed AI scan result by ID
 *     description: Retrieve detailed information about a specific AI scan result.
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: AI scan result ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Successfully retrieved scan result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AiScanResult'
 *       404:
 *         description: Scan result not found
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       example: "Scan result not found"
 *       401:
 *         description: Unauthorized - invalid or missing authentication token
 *       403:
 *         description: Forbidden - scan result belongs to another user
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getScanResult);

/**
 * @swagger
 * /api/ai-scanner/{id}:
 *   delete:
 *     summary: Delete AI scan result
 *     description: Delete a specific AI scan result and its associated image file.
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: AI scan result ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Successfully deleted scan result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Scan result deleted successfully"
 *       404:
 *         description: Scan result not found
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     error:
 *                       type: string
 *                       example: "Scan result not found"
 *       401:
 *         description: Unauthorized - invalid or missing authentication token
 *       403:
 *         description: Forbidden - scan result belongs to another user
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteScanResult);

/**
 * @swagger
 * /api/ai-scanner/test:
 *   get:
 *     summary: Test AI scanner endpoint
 *     description: Test the AI scanner API and check configuration status.
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test response with configuration status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "AI Scanner API is working"
 *                     config:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "openrouter"
 *                         openrouter:
 *                           type: boolean
 *                           example: true
 *                         openai:
 *                           type: boolean
 *                           example: false
 *       401:
 *         description: Unauthorized - invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get('/test', testAIScanner);

module.exports = router;

