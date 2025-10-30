import express from 'express';
import Stripe from 'stripe';
import axios from 'axios';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Orange Money API Integration
class OrangeMoneyAPI {
  constructor() {
    this.baseURL = process.env.ORANGE_MONEY_API_URL;
    this.clientId = process.env.ORANGE_MONEY_CLIENT_ID;
    this.clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
    this.merchantCode = process.env.ORANGE_MONEY_MERCHANT_CODE;
  }

  async getAccessToken() {
    try {
      const response = await axios.post(`${this.baseURL}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      });
      return response.data.access_token;
    } catch (error) {
      throw new Error('Failed to get Orange Money access token');
    }
  }

  async initiatePayment(amount, currency, phoneNumber, reference) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.post(
        `${this.baseURL}/omcoreapis/1.0.2/mp/pay`,
        {
          merchant_code: this.merchantCode,
          amount: amount,
          currency: currency,
          msisdn: phoneNumber,
          reference: reference,
          return_url: `${process.env.FRONTEND_URL}/payment/success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
          notif_url: `${process.env.BACKEND_URL}/api/payments/webhook/orange-money`
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error('Failed to initiate Orange Money payment');
    }
  }

  async checkPaymentStatus(transactionId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/omcoreapis/1.0.2/mp/paymentstatus/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error('Failed to check Orange Money payment status');
    }
  }
}

// MTN Money API Integration
class MTNMoneyAPI {
  constructor() {
    this.baseURL = process.env.MTN_MONEY_API_URL;
    this.subscriptionKey = process.env.MTN_MONEY_SUBSCRIPTION_KEY;
    this.userId = process.env.MTN_MONEY_USER_ID;
    this.apiKey = process.env.MTN_MONEY_API_KEY;
  }

  async getAccessToken() {
    try {
      const response = await axios.post(
        `${this.baseURL}/collection/token/`,
        {},
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Authorization': `Basic ${Buffer.from(`${this.userId}:${this.apiKey}`).toString('base64')}`
          }
        }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error('Failed to get MTN Money access token');
    }
  }

  async requestPayment(amount, currency, phoneNumber, reference) {
    try {
      const token = await this.getAccessToken();
      const transactionId = `mtn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await axios.post(
        `${this.baseURL}/collection/v1_0/requesttopay`,
        {
          amount: amount.toString(),
          currency: currency,
          externalId: reference,
          payer: {
            partyIdType: 'MSISDN',
            partyId: phoneNumber
          },
          payerMessage: `Payment for FastDeal order ${reference}`,
          payeeNote: `FastDeal payment ${reference}`
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Reference-Id': transactionId,
            'X-Target-Environment': process.env.MTN_MONEY_ENVIRONMENT || 'sandbox',
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/json'
          }
        }
      );

      return { transactionId, ...response.data };
    } catch (error) {
      throw new Error('Failed to initiate MTN Money payment');
    }
  }

  async checkPaymentStatus(transactionId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/collection/v1_0/requesttopay/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Target-Environment': process.env.MTN_MONEY_ENVIRONMENT || 'sandbox',
            'Ocp-Apim-Subscription-Key': this.subscriptionKey
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error('Failed to check MTN Money payment status');
    }
  }
}

const orangeMoneyAPI = new OrangeMoneyAPI();
const mtnMoneyAPI = new MTNMoneyAPI();

// Create Stripe payment intent
router.post('/stripe/create-intent', authenticateToken, [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('currency').isIn(['USD', 'EUR']).withMessage('Invalid currency'),
  body('orderId').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { amount, currency, orderId } = req.body;

  // Verify order exists and belongs to user
  const order = await Order.findById(orderId);
  if (!order || order.buyer.toString() !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        orderId: orderId,
        userId: req.user.id
      }
    });

    // Create payment record
    const payment = new Payment({
      order: orderId,
      user: req.user.id,
      amount,
      currency,
      method: 'stripe',
      stripeDetails: {
        paymentIntentId: paymentIntent.id
      }
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentId: payment.paymentId
      }
    });
  } catch (error) {
    console.error('Stripe payment creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent'
    });
  }
}));

// Orange Money payment initiation
router.post('/orange-money/initiate', authenticateToken, [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('phoneNumber').isMobilePhone().withMessage('Invalid phone number'),
  body('orderId').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { amount, phoneNumber, orderId } = req.body;

  // Verify order
  const order = await Order.findById(orderId);
  if (!order || order.buyer.toString() !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  try {
    // Create payment record
    const payment = new Payment({
      order: orderId,
      user: req.user.id,
      amount,
      currency: 'XOF',
      method: 'orange_money',
      mobileMoneyDetails: {
        phoneNumber,
        operator: 'orange'
      }
    });

    await payment.save();

    // Initiate Orange Money payment
    const orangeResponse = await orangeMoneyAPI.initiatePayment(
      amount,
      'XOF',
      phoneNumber,
      payment.paymentId
    );

    // Update payment with gateway response
    payment.gateway.transactionId = orangeResponse.transaction_id;
    payment.gateway.gatewayResponse = orangeResponse;
    payment.status = 'processing';
    await payment.save();

    res.json({
      success: true,
      message: 'Orange Money payment initiated. Please complete the payment on your phone.',
      data: {
        paymentId: payment.paymentId,
        transactionId: orangeResponse.transaction_id,
        paymentUrl: orangeResponse.payment_url
      }
    });
  } catch (error) {
    console.error('Orange Money payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate Orange Money payment'
    });
  }
}));

// MTN Money payment initiation
router.post('/mtn-money/initiate', authenticateToken, [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('phoneNumber').isMobilePhone().withMessage('Invalid phone number'),
  body('orderId').isMongoId().withMessage('Invalid order ID')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { amount, phoneNumber, orderId } = req.body;

  // Verify order
  const order = await Order.findById(orderId);
  if (!order || order.buyer.toString() !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  try {
    // Create payment record
    const payment = new Payment({
      order: orderId,
      user: req.user.id,
      amount,
      currency: 'XOF',
      method: 'mtn_money',
      mobileMoneyDetails: {
        phoneNumber,
        operator: 'mtn'
      }
    });

    await payment.save();

    // Initiate MTN Money payment
    const mtnResponse = await mtnMoneyAPI.requestPayment(
      amount,
      'XOF',
      phoneNumber,
      payment.paymentId
    );

    // Update payment with gateway response
    payment.gateway.transactionId = mtnResponse.transactionId;
    payment.gateway.gatewayResponse = mtnResponse;
    payment.status = 'processing';
    await payment.save();

    res.json({
      success: true,
      message: 'MTN Money payment initiated. Please complete the payment on your phone.',
      data: {
        paymentId: payment.paymentId,
        transactionId: mtnResponse.transactionId
      }
    });
  } catch (error) {
    console.error('MTN Money payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate MTN Money payment'
    });
  }
}));

// Check payment status
router.get('/status/:paymentId', authenticateToken, asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findOne({ paymentId }).populate('order');
  
  if (!payment || payment.user.toString() !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  try {
    let gatewayStatus = null;

    // Check status with gateway based on payment method
    if (payment.method === 'orange_money' && payment.gateway.transactionId) {
      gatewayStatus = await orangeMoneyAPI.checkPaymentStatus(payment.gateway.transactionId);
    } else if (payment.method === 'mtn_money' && payment.gateway.transactionId) {
      gatewayStatus = await mtnMoneyAPI.checkPaymentStatus(payment.gateway.transactionId);
    } else if (payment.method === 'stripe' && payment.stripeDetails.paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripeDetails.paymentIntentId);
      gatewayStatus = { status: paymentIntent.status };
    }

    // Update payment status if needed
    if (gatewayStatus) {
      const isCompleted = gatewayStatus.status === 'succeeded' || 
                         gatewayStatus.status === 'SUCCESSFUL' ||
                         gatewayStatus.status === 'completed';

      if (isCompleted && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.completedAt = new Date();
        
        // Update order payment status
        const order = await Order.findById(payment.order);
        if (order) {
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          await order.save();
        }
        
        await payment.save();
      }
    }

    res.json({
      success: true,
      data: {
        payment: {
          id: payment.paymentId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          createdAt: payment.createdAt,
          completedAt: payment.completedAt
        },
        gatewayStatus
      }
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
}));

// Orange Money webhook
router.post('/webhook/orange-money', asyncHandler(async (req, res) => {
  const { transaction_id, status, reference } = req.body;

  try {
    const payment = await Payment.findOne({ paymentId: reference });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Update payment status
    if (status === 'SUCCESS') {
      await payment.markCompleted(req.body);
      
      // Update order
      const order = await Order.findById(payment.order);
      if (order) {
        order.paymentStatus = 'paid';
        order.status = 'confirmed';
        await order.save();
      }
    } else if (status === 'FAILED') {
      await payment.markFailed('Payment failed', req.body);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Orange Money webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
}));

// Stripe webhook
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      
      // Find payment by stripe payment intent ID
      const payment = await Payment.findOne({
        'stripeDetails.paymentIntentId': paymentIntent.id
      });

      if (payment) {
        await payment.markCompleted(paymentIntent);
        
        // Update order
        const order = await Order.findById(payment.order);
        if (order) {
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          await order.save();
        }
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      
      const failedPaymentRecord = await Payment.findOne({
        'stripeDetails.paymentIntentId': failedPayment.id
      });

      if (failedPaymentRecord) {
        await failedPaymentRecord.markFailed('Payment failed', failedPayment);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
}));

// Get user payments
router.get('/my-payments', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const payments = await Payment.find({ user: req.user.id })
    .populate('order', 'orderNumber total items')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Payment.countDocuments({ user: req.user.id });

  res.json({
    success: true,
    data: {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

export default router;