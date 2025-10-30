import express from 'express';
import { body, validationResult, query } from 'express-validator';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { authenticateToken, adminMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Apply admin middleware to all routes
router.use(authenticateToken);
router.use(adminMiddleware);

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/csv/');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'products-' + uniqueSuffix + '.csv');
  }
});

const csvUpload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Admin dashboard statistics
router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      recentUsers,
      recentOrders,
      topProducts
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      User.find({}).sort({ createdAt: -1 }).limit(5).select('name email createdAt'),
      Order.find({}).sort({ createdAt: -1 }).limit(5).populate('user', 'name email'),
      Product.find({}).sort({ sales: -1 }).limit(5).select('name price sales category')
    ]);

    res.json({
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0
      },
      recentUsers,
      recentOrders,
      topProducts
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Error fetching dashboard data' });
  }
}));

// Get all users with pagination
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const skip = (page - 1) * limit;

  const searchQuery = search ? {
    $or: [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ]
  } : {};

  const [users, total] = await Promise.all([
    User.find(searchQuery)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(searchQuery)
  ]);

  res.json({
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get user details
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userOrders = await Order.find({ user: user._id })
    .populate('items.product', 'name price')
    .sort({ createdAt: -1 });

  res.json({ user, orders: userOrders });
}));

// Update user status
router.patch('/users/:id/status', [
  body('isActive').isBoolean(),
  body('role').optional().isIn(['user', 'admin', 'moderator'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { isActive, role } = req.body;
  const updateData = { isActive };
  
  if (role) {
    updateData.role = role;
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  ).select('-password');

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ message: 'User updated successfully', user });
}));

// Get all products with filters
router.get('/products', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive', 'out_of_stock'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let query = {};
  
  if (req.query.category) {
    query.category = req.query.category;
  }
  
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(query)
  ]);

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Create new product
router.post('/products', [
  body('name').trim().isLength({ min: 1 }).withMessage('Product name is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').trim().isLength({ min: 1 }).withMessage('Category is required'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('images').optional().isArray(),
  body('specifications').optional().isObject(),
  body('tags').optional().isArray()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const product = new Product({
    ...req.body,
    seller: req.user.id
  });

  await product.save();
  res.status(201).json({ message: 'Product created successfully', product });
}));

// Update product
router.put('/products/:id', [
  body('name').optional().trim().isLength({ min: 1 }),
  body('description').optional().trim().isLength({ min: 1 }),
  body('price').optional().isFloat({ min: 0 }),
  body('category').optional().trim().isLength({ min: 1 }),
  body('stock').optional().isInt({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive', 'out_of_stock'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ message: 'Product updated successfully', product });
}));

// Delete product
router.delete('/products/:id', asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({ message: 'Product deleted successfully' });
}));

// Bulk import products from CSV
router.post('/products/import', csvUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }

  const results = [];
  const errors = [];

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const validProducts = [];
    
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      
      try {
        // Validate required fields
        if (!row.name || !row.price || !row.category) {
          errors.push(`Row ${i + 1}: Missing required fields (name, price, category)`);
          continue;
        }

        const product = {
          name: row.name.trim(),
          description: row.description || '',
          price: parseFloat(row.price),
          category: row.category.trim(),
          stock: parseInt(row.stock) || 0,
          condition: row.condition || 'new',
          seller: req.user.id,
          images: row.images ? row.images.split(',').map(img => img.trim()) : [],
          specifications: row.specifications ? JSON.parse(row.specifications) : {},
          tags: row.tags ? row.tags.split(',').map(tag => tag.trim()) : []
        };

        validProducts.push(product);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    // Insert valid products
    let insertedProducts = [];
    if (validProducts.length > 0) {
      insertedProducts = await Product.insertMany(validProducts);
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'Import completed',
      imported: insertedProducts.length,
      errors: errors.length,
      errorDetails: errors
    });

  } catch (error) {
    console.error('Import error:', error);
    // Clean up uploaded file on error
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error processing CSV file' });
  }
}));

// Get all orders with filters
router.get('/orders', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let query = {};
  
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  if (req.query.dateFrom || req.query.dateTo) {
    query.createdAt = {};
    if (req.query.dateFrom) {
      query.createdAt.$gte = new Date(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      query.createdAt.$lte = new Date(req.query.dateTo);
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('user', 'name email')
      .populate('items.product', 'name price category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(query)
  ]);

  res.json({
    orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// Update order status
router.patch('/orders/:id/status', [
  body('status').isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  body('notes').optional().isString()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status, notes } = req.body;
  
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { 
      status, 
      notes,
      updatedAt: new Date()
    },
    { new: true }
  ).populate('user', 'name email');

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json({ message: 'Order status updated successfully', order });
}));

// Get payments with filters
router.get('/payments', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded']),
  query('method').optional().isString()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let query = {};
  
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  if (req.query.method) {
    query.method = req.query.method;
  }

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('user', 'name email')
      .populate('order')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(query)
  ]);

  res.json({
    payments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// System settings
router.get('/settings', asyncHandler(async (req, res) => {
  // This would typically come from a settings collection
  const settings = {
    siteName: 'FastDeal',
    currency: 'XOF',
    taxRate: 0.18,
    shippingFee: 2500,
    maintenanceMode: false,
    allowRegistration: true,
    emailNotifications: true,
    paymentMethods: ['orange_money', 'mtn_momo', 'wave', 'bank_transfer']
  };

  res.json(settings);
}));

// Update system settings
router.put('/settings', [
  body('siteName').optional().trim().isLength({ min: 1 }),
  body('currency').optional().isIn(['XOF', 'USD', 'EUR']),
  body('taxRate').optional().isFloat({ min: 0, max: 1 }),
  body('shippingFee').optional().isFloat({ min: 0 }),
  body('maintenanceMode').optional().isBoolean(),
  body('allowRegistration').optional().isBoolean(),
  body('emailNotifications').optional().isBoolean()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // In a real app, you'd save these to a settings collection
  res.json({ message: 'Settings updated successfully', settings: req.body });
}));

export default router;