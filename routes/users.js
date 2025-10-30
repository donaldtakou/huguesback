import express from 'express';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { authenticateToken, adminOrModerator } from '../middleware/auth.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', adminOrModerator, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .select('-password -emailVerificationToken -passwordResetToken')
      .lean();

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalUsers: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Users can only view their own profile, unless they're admin
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own profile'
      });
    }

    const user = await User.findById(userId)
      .select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user does not exist'
      });
    }

    // Get user's products count
    const productsCount = await Product.countDocuments({ seller: userId });
    
    // Get user's orders as buyer and seller
    const ordersAsBuyer = await Order.countDocuments({ buyer: userId });
    const ordersAsSeller = await Order.countDocuments({ seller: userId });

    res.json({
      user: {
        ...user.toObject(),
        statistics: {
          ...user.statistics,
          totalProductsListed: productsCount,
          totalOrdersAsBuyer: ordersAsBuyer,
          totalOrdersAsSeller: ordersAsSeller
        }
      }
    });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: error.message
    });
  }
});

// Update user (admin only)
router.put('/:id', adminOrModerator, async (req, res) => {
  try {
    const userId = req.params.id;
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'role', 'isActive', 
      'isEmailVerified', 'address', 'preferences'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user does not exist'
      });
    }

    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: error.message
    });
  }
});

// Delete user (admin only)
router.delete('/:id', adminOrModerator, async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user has active orders or products
    const activeProducts = await Product.countDocuments({ 
      seller: userId, 
      availability: 'in-stock' 
    });
    
    const activeOrders = await Order.countDocuments({
      $or: [{ buyer: userId }, { seller: userId }],
      status: { $in: ['pending', 'confirmed', 'processing', 'shipped'] }
    });

    if (activeProducts > 0 || activeOrders > 0) {
      return res.status(400).json({
        error: 'Cannot delete user',
        message: 'User has active products or orders. Please resolve them first.'
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user does not exist'
      });
    }

    res.json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('User deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: error.message
    });
  }
});

// Get user's products
router.get('/:id/products', async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      page = 1,
      limit = 12,
      category,
      condition,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { 
      seller: userId,
      isValidated: true,
      availability: 'in-stock'
    };
    
    if (category) filter.category = category;
    if (condition) filter.condition = condition;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
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
      error: 'Failed to fetch user products',
      message: error.message
    });
  }
});

// Get user statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Users can only view their own stats, unless they're admin
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own statistics'
      });
    }

    // Get detailed statistics
    const [
      totalProducts,
      activeProducts,
      soldProducts,
      totalViews,
      ordersAsBuyer,
      ordersAsSeller,
      totalRevenue
    ] = await Promise.all([
      Product.countDocuments({ seller: userId }),
      Product.countDocuments({ seller: userId, availability: 'in-stock' }),
      Product.countDocuments({ seller: userId, availability: 'out-of-stock' }),
      Product.aggregate([
        { $match: { seller: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
      ]),
      Order.countDocuments({ buyer: userId }),
      Order.countDocuments({ seller: userId }),
      Order.aggregate([
        { 
          $match: { 
            seller: mongoose.Types.ObjectId(userId),
            status: 'delivered'
          } 
        },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
      ])
    ]);

    const stats = {
      products: {
        total: totalProducts,
        active: activeProducts,
        sold: soldProducts,
        totalViews: totalViews[0]?.totalViews || 0
      },
      orders: {
        asBuyer: ordersAsBuyer,
        asSeller: ordersAsSeller
      },
      revenue: {
        total: totalRevenue[0]?.totalRevenue || 0
      }
    };

    res.json({ stats });
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch user statistics',
      message: error.message
    });
  }
});

// Search users (admin only)
router.get('/search/:query', adminOrModerator, async (req, res) => {
  try {
    const query = req.params.query;
    const limit = parseInt(req.query.limit) || 10;

    const users = await User.find({
      $or: [
        { firstName: new RegExp(query, 'i') },
        { lastName: new RegExp(query, 'i') },
        { email: new RegExp(query, 'i') }
      ]
    })
    .select('firstName lastName email avatar role')
    .limit(limit)
    .lean();

    res.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({
      error: 'Failed to search users',
      message: error.message
    });
  }
});

// Get user dashboard data
router.get('/:id/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Users can only view their own dashboard, unless they're admin
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own dashboard'
      });
    }

    // Get recent activity
    const [recentProducts, recentOrders, recentViews] = await Promise.all([
      Product.find({ seller: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name price images createdAt views'),
      Order.find({
        $or: [{ buyer: userId }, { seller: userId }]
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('product', 'name images')
        .populate('buyer', 'firstName lastName')
        .populate('seller', 'firstName lastName'),
      Product.find({ seller: userId })
        .sort({ views: -1 })
        .limit(5)
        .select('name views images')
    ]);

    const dashboard = {
      recentProducts,
      recentOrders,
      mostViewedProducts: recentViews
    };

    res.json({ dashboard });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

export default router;