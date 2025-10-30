import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

const router = express.Router();

// Create new order
router.post('/', authenticateToken, [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shippingAddress.firstName').notEmpty().withMessage('First name is required'),
  body('shippingAddress.lastName').notEmpty().withMessage('Last name is required'),
  body('shippingAddress.street').notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.region').notEmpty().withMessage('Region is required'),
  body('shippingAddress.country').isIn(['Benin', 'Burkina Faso', 'Côte d\'Ivoire', 'Ghana', 'Mali', 'Niger', 'Senegal', 'Togo']).withMessage('Invalid country'),
  body('shippingAddress.phone').isMobilePhone().withMessage('Invalid phone number'),
  body('paymentMethod').isIn(['orange_money', 'mtn_money', 'paypal', 'stripe', 'bank_transfer']).withMessage('Invalid payment method')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { items, shippingAddress, paymentMethod, notes } = req.body;

  try {
    // Validate and process items
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product)
        .populate('seller', 'firstName lastName');

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.product} not found`
        });
      }

      if (product.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: `Product ${product.name} is not available`
        });
      }

      if (product.availability !== 'in-stock') {
        return res.status(400).json({
          success: false,
          message: `Product ${product.name} is out of stock`
        });
      }

      // Check if buyer is not the seller
      if (product.seller._id.toString() === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'You cannot buy your own product'
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        seller: product.seller._id
      });
    }

    // Calculate shipping and total
    const shippingCost = subtotal >= 50000 ? 0 : 5000; // Free shipping over 50,000 XOF
    const taxes = 0; // No taxes for now
    const discount = 0; // No discount for now
    const total = subtotal + shippingCost + taxes - discount;

    // Create order
    const order = new Order({
      buyer: req.user.id,
      items: orderItems,
      subtotal,
      shippingCost,
      taxes,
      discount,
      total,
      currency: 'XOF',
      paymentMethod,
      shippingAddress,
      notes: {
        customer: notes?.customer || ''
      }
    });

    await order.save();

    // Populate order with product and user details
    await order.populate([
      {
        path: 'items.product',
        select: 'name images price category brand'
      },
      {
        path: 'items.seller',
        select: 'firstName lastName email phone'
      },
      {
        path: 'buyer',
        select: 'firstName lastName email phone'
      }
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order
      }
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
}));

// Get user orders
router.get('/my-orders', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  let filter = { buyer: req.user.id };
  if (status) {
    filter.status = status;
  }

  const orders = await Order.find(filter)
    .populate([
      {
        path: 'items.product',
        select: 'name images price category brand'
      },
      {
        path: 'items.seller',
        select: 'firstName lastName'
      }
    ])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(filter);

  res.json({
    success: true,
    data: {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Get user sales (orders for products they sold)
router.get('/my-sales', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status;

  let filter = { 'items.seller': req.user.id };
  if (status) {
    filter.status = status;
  }

  const orders = await Order.find(filter)
    .populate([
      {
        path: 'items.product',
        select: 'name images price category brand'
      },
      {
        path: 'buyer',
        select: 'firstName lastName email phone'
      }
    ])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(filter);

  // Filter items to only show those sold by current user
  const salesOrders = orders.map(order => ({
    ...order.toObject(),
    items: order.items.filter(item => item.seller.toString() === req.user.id)
  }));

  res.json({
    success: true,
    data: {
      orders: salesOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Get single order
router.get('/:orderId', authenticateToken, asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId)
    .populate([
      {
        path: 'items.product',
        select: 'name images price category brand specifications'
      },
      {
        path: 'items.seller',
        select: 'firstName lastName email phone avatar'
      },
      {
        path: 'buyer',
        select: 'firstName lastName email phone avatar'
      }
    ]);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user is the buyer or seller of any item in the order
  const isAuthorized = order.buyer._id.toString() === req.user.id ||
                      order.items.some(item => item.seller._id.toString() === req.user.id);

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  res.json({
    success: true,
    data: {
      order
    }
  });
}));

// Update order status (for sellers)
router.patch('/:orderId/status', authenticateToken, [
  body('status').isIn(['confirmed', 'processing', 'shipped', 'delivered']).withMessage('Invalid status'),
  body('tracking').optional().isObject(),
  body('tracking.carrier').optional().notEmpty(),
  body('tracking.trackingNumber').optional().notEmpty(),
  body('notes').optional().isString()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { orderId } = req.params;
  const { status, tracking, notes } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user is seller of any item in the order
  const isSeller = order.items.some(item => item.seller.toString() === req.user.id);

  if (!isSeller) {
    return res.status(403).json({
      success: false,
      message: 'Only sellers can update order status'
    });
  }

  // Update order
  order.status = status;
  
  if (tracking) {
    order.tracking = { ...order.tracking, ...tracking };
  }

  if (notes) {
    order.notes.admin = notes;
  }

  if (status === 'delivered') {
    order.deliveredAt = new Date();
  }

  await order.save();

  // If all items are delivered, mark products as sold
  if (status === 'delivered') {
    for (const item of order.items) {
      if (item.seller.toString() === req.user.id) {
        await Product.findByIdAndUpdate(item.product, {
          status: 'sold',
          soldTo: order.buyer,
          soldAt: new Date()
        });
      }
    }
  }

  res.json({
    success: true,
    message: 'Order status updated successfully',
    data: {
      order
    }
  });
}));

// Cancel order
router.patch('/:orderId/cancel', authenticateToken, [
  body('reason').notEmpty().withMessage('Cancellation reason is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { orderId } = req.params;
  const { reason } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if user is the buyer
  if (order.buyer.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Only buyers can cancel orders'
    });
  }

  // Check if order can be cancelled
  if (['shipped', 'delivered'].includes(order.status)) {
    return res.status(400).json({
      success: false,
      message: 'Cannot cancel order that has been shipped or delivered'
    });
  }

  // Update order
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = reason;

  await order.save();

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    data: {
      order
    }
  });
}));

// Get order statistics
router.get('/stats/overview', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Buyer statistics
  const buyerStats = await Order.aggregate([
    { $match: { buyer: userId } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        averageOrderValue: { $avg: '$total' }
      }
    }
  ]);

  // Seller statistics
  const sellerStats = await Order.aggregate([
    { $match: { 'items.seller': userId } },
    { $unwind: '$items' },
    { $match: { 'items.seller': userId } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        averageSaleValue: { $avg: { $multiply: ['$items.price', '$items.quantity'] } }
      }
    }
  ]);

  // Order status breakdown
  const statusBreakdown = await Order.aggregate([
    { $match: { buyer: userId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  res.json({
    success: true,
    data: {
      buyer: buyerStats[0] || { totalOrders: 0, totalSpent: 0, averageOrderValue: 0 },
      seller: sellerStats[0] || { totalSales: 0, totalRevenue: 0, averageSaleValue: 0 },
      statusBreakdown
    }
  });
}));

export default router;