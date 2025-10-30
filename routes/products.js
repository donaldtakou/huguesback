import express from 'express';
import Product from '../models/Product.js';
import { authenticateToken, optionalAuth, adminOrModerator } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/products/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: function (req, file, cb) {
    // Extensions autorisées (tous les formats d'images courants)
    const allowedTypes = /jpeg|jpg|png|webp|gif|svg|bmp|tiff|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Types MIME autorisés
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/x-icon',
      'image/vnd.microsoft.icon'
    ];
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype || extname) {
      console.log('✅ File type allowed:', file.originalname, 'MIME:', file.mimetype);
      return cb(null, true);
    } else {
      console.log('❌ File type rejected:', file.originalname, 'MIME:', file.mimetype);
      cb(new Error('Format non supporté. Formats acceptés: JPEG, JPG, PNG, WebP, GIF, SVG, BMP, TIFF, ICO'));
    }
  }
});

// Get all products with filtering and pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      condition,
      minPrice,
      maxPrice,
      brand,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      featured,
      validated = 'true'
    } = req.query;

    // Build filter object
    const filter = {};
    
    // Only show validated products for non-admin users
    if (validated === 'true' && (!req.user || req.user.role !== 'admin')) {
      filter.isValidated = true;
    }

    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (featured === 'true') filter.isFeatured = true;
    
    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Text search
    if (search) {
      filter.$text = { $search: search };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate('seller', 'firstName lastName statistics.averageRating')
      .lean();

    // Get total count for pagination
    const total = await Product.countDocuments(filter);

    res.json({
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      },
      filters: {
        category,
        condition,
        minPrice,
        maxPrice,
        brand,
        search,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

// Get single product by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId)
      .populate('seller', 'firstName lastName avatar statistics phone email createdAt')
      .lean();

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    // Check if user can view unvalidated products
    if (!product.isValidated && (!req.user || req.user.role !== 'admin')) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    // Increment view count (but not for the owner)
    if (!req.user || req.user.userId !== product.seller._id.toString()) {
      await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
      product.views += 1;
    }

    res.json({ product });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

// Create new product
router.post('/', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      brand,
      model,
      condition,
      price,
      originalPrice,
      specifications,
      location,
      tags
    } = req.body;

    // Parse JSON fields if they're strings
    const parsedSpecs = typeof specifications === 'string' 
      ? JSON.parse(specifications) 
      : specifications;
    
    const parsedLocation = typeof location === 'string' 
      ? JSON.parse(location) 
      : location;
    
    const parsedTags = typeof tags === 'string' 
      ? JSON.parse(tags) 
      : tags;

    // Process uploaded images
    const images = req.files?.map((file, index) => ({
      url: `/uploads/products/${file.filename}`,
      alt: `${name} - Image ${index + 1}`,
      isPrimary: index === 0 // First image is primary
    })) || [];

    // Create product
    const product = new Product({
      name,
      description,
      category,
      brand,
      model,
      condition,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
      images,
      specifications: parsedSpecs,
      location: parsedLocation,
      tags: parsedTags,
      seller: req.user.userId
    });

    await product.save();

    // Populate seller info for response
    await product.populate('seller', 'firstName lastName');

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

// Update product
router.put('/:id', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    // Check ownership or admin rights
    if (product.seller.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own products'
      });
    }

    const {
      name,
      description,
      category,
      brand,
      model,
      condition,
      price,
      originalPrice,
      specifications,
      location,
      tags,
      availability,
      keepExistingImages = 'true'
    } = req.body;

    // Update fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (brand) product.brand = brand;
    if (model) product.model = model;
    if (condition) product.condition = condition;
    if (price) product.price = parseFloat(price);
    if (originalPrice !== undefined) product.originalPrice = originalPrice ? parseFloat(originalPrice) : undefined;
    if (availability) product.availability = availability;

    // Update complex fields
    if (specifications) {
      product.specifications = typeof specifications === 'string' 
        ? JSON.parse(specifications) 
        : specifications;
    }
    
    if (location) {
      product.location = typeof location === 'string' 
        ? JSON.parse(location) 
        : location;
    }
    
    if (tags) {
      product.tags = typeof tags === 'string' 
        ? JSON.parse(tags) 
        : tags;
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file, index) => ({
        url: `/uploads/products/${file.filename}`,
        alt: `${product.name} - Image ${index + 1}`,
        isPrimary: keepExistingImages === 'false' && index === 0
      }));

      if (keepExistingImages === 'false') {
        product.images = newImages;
      } else {
        product.images = [...product.images, ...newImages];
      }
    }

    // If product was modified and it was previously validated, mark as unvalidated
    if (req.user.role !== 'admin' && product.isValidated) {
      product.isValidated = false;
      product.validatedBy = undefined;
      product.validatedAt = undefined;
    }

    await product.save();
    await product.populate('seller', 'firstName lastName');

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

// Delete product
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    // Check ownership or admin rights
    if (product.seller.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own products'
      });
    }

    await Product.findByIdAndDelete(productId);

    res.json({
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete product',
      message: error.message
    });
  }
});

// Get user's products
router.get('/user/my-products', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { seller: req.user.userId };
    
    if (status) {
      if (status === 'validated') filter.isValidated = true;
      if (status === 'pending') filter.isValidated = false;
      if (status === 'available') filter.availability = 'in-stock';
      if (status === 'sold') filter.availability = 'out-of-stock';
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('User products fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch your products',
      message: error.message
    });
  }
});

// Get product categories with counts
router.get('/stats/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $match: { isValidated: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ categories });
  } catch (error) {
    console.error('Categories stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

// Routes de développement pour toutes les opérations CRUD sans authentification
// Route de création (déjà existante, mise à jour)
router.post('/dev-create', upload.array('images', 10), async (req, res) => {
  try {
    console.log('=== DEV CREATE ROUTE CALLED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request files:', req.files ? req.files.length : 0);
    
    // Conversion de la condition pour compatibilité
    let condition = req.body.condition || 'excellent';
    if (condition === 'new') condition = 'excellent';
    if (condition === 'used') condition = 'good';
    if (condition === 'refurbished') condition = 'very-good';
    
    // Parse images si envoyées en tant que JSON string
    let images = [];
    
    // 1. Si des fichiers sont uploadés directement
    if (req.files && req.files.length > 0) {
      images = req.files.map((file, index) => ({
        url: `/uploads/products/${file.filename}`,
        alt: req.body.name || 'Product image',
        isPrimary: index === 0
      }));
      console.log('✅ Images from uploaded files:', images.length);
    }
    // 2. Si des URLs d'images sont envoyées dans le body (déjà uploadées via /upload/single)
    else if (req.body.images) {
      try {
        const bodyImages = typeof req.body.images === 'string' 
          ? JSON.parse(req.body.images) 
          : req.body.images;
        
        if (Array.isArray(bodyImages) && bodyImages.length > 0) {
          images = bodyImages.map((img, index) => ({
            url: typeof img === 'string' ? img : img.url,
            alt: (typeof img === 'object' && img.alt) ? img.alt : (req.body.name || 'Product image'),
            isPrimary: index === 0
          }));
          console.log('✅ Images from body URLs:', images.length);
        }
      } catch (e) {
        console.log('⚠️ Error parsing images from body:', e.message);
      }
    }
    
    // Parse tags if string
    let tags = req.body.tags || [];
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch (e) {
        tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }
    
    // Parse specifications if string
    let specifications = req.body.specifications || {};
    if (typeof specifications === 'string') {
      try {
        specifications = JSON.parse(specifications);
      } catch (e) {
        specifications = {};
      }
    }
    
    // Parse location if string
    let location = req.body.location;
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch (e) {
        location = { city: 'Douala', country: 'Cameroun' };
      }
    }
    
    // Données minimales requises pour créer un produit
    const productData = {
      name: req.body.name || 'Produit Test ' + Date.now(),
      description: req.body.description || 'Description automatique du produit de test',
      category: req.body.category || 'smartphone',
      brand: req.body.brand || 'Apple',
      model: req.body.model || 'Model Test',
      condition: condition,
      price: parseFloat(req.body.price) || 999,
      originalPrice: req.body.originalPrice ? parseFloat(req.body.originalPrice) : undefined,
      stock: parseInt(req.body.stock) || 1,
      availability: req.body.availability || 'in-stock',
      specifications: specifications,
      location: location || { city: 'Douala', country: 'Cameroun' },
      tags: tags,
      seller: '507f1f77bcf86cd799439011', // ID MongoDB valide par défaut
      images: images,
      isValidated: true,
      views: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('Product data to save:', JSON.stringify(productData, null, 2));

    const product = new Product(productData);
    const savedProduct = await product.save();

    console.log('✅ Product saved successfully:', savedProduct._id);

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès (dev mode)',
      product: savedProduct
    });
  } catch (error) {
    console.error('=== ERROR IN DEV CREATE ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.errors) {
      console.error('Validation errors:');
      Object.keys(error.errors).forEach(key => {
        console.error(`  ${key}: ${error.errors[key].message}`);
      });
    }
    
    res.status(400).json({
      success: false,
      error: 'Erreur lors de la création du produit',
      message: error.message,
      details: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : undefined
    });
  }
});

// Route de suppression pour le développement
router.delete('/dev-delete/:id', async (req, res) => {
  try {
    console.log('=== DEV DELETE ROUTE CALLED ===');
    console.log('Product ID:', req.params.id);

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

    console.log('Product deleted successfully:', req.params.id);

    res.json({
      success: true,
      message: 'Produit supprimé avec succès (dev mode)'
    });
  } catch (error) {
    console.error('=== ERROR IN DEV DELETE ===');
    console.error('Error message:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression',
      message: error.message
    });
  }
});

// Route de modification pour le développement
router.put('/dev-update/:id', upload.array('images', 10), async (req, res) => {
  try {
    console.log('=== DEV UPDATE ROUTE CALLED ===');
    console.log('Product ID:', req.params.id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Conversion de la condition pour compatibilité
    let condition = req.body.condition || 'excellent';
    if (condition === 'new') condition = 'excellent';
    if (condition === 'used') condition = 'good';
    if (condition === 'refurbished') condition = 'very-good';

    const updateData = {
      ...req.body,
      condition: condition,
      updatedAt: new Date()
    };

    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => ({
        url: `/uploads/products/${file.filename}`,
        alt: req.body.name || 'Product image',
        isPrimary: file === req.files[0]
      }));
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('seller', 'firstName lastName email');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produit non trouvé'
      });
    }

    console.log('Product updated successfully:', product._id);

    res.json({
      success: true,
      message: 'Produit modifié avec succès (dev mode)',
      product
    });
  } catch (error) {
    console.error('=== ERROR IN DEV UPDATE ===');
    console.error('Error message:', error.message);
    
    res.status(400).json({
      success: false,
      error: 'Erreur lors de la modification',
      message: error.message
    });
  }
});

export default router;