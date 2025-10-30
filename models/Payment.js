import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    unique: true,
    required: [true, 'Payment ID is required']
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Order is required']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    enum: ['XOF', 'USD', 'EUR']
  },
  method: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['orange_money', 'mtn_money', 'paypal', 'stripe', 'bank_transfer']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  gateway: {
    transactionId: String,
    gatewayResponse: mongoose.Schema.Types.Mixed,
    gatewayFees: Number
  },
  mobileMoneyDetails: {
    phoneNumber: String,
    operator: {
      type: String,
      enum: ['orange', 'mtn', 'moov']
    },
    reference: String
  },
  paypalDetails: {
    paymentId: String,
    payerId: String,
    orderDetails: mongoose.Schema.Types.Mixed
  },
  stripeDetails: {
    paymentIntentId: String,
    chargeId: String,
    receiptUrl: String
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String
  },
  fees: {
    platformFee: {
      type: Number,
      default: 0
    },
    gatewayFee: {
      type: Number,
      default: 0
    },
    totalFees: {
      type: Number,
      default: 0
    }
  },
  settlement: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    amount: Number,
    settledAt: Date,
    reference: String
  },
  refund: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    refundId: String
  },
  attempts: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: String,
    errorMessage: String,
    gatewayResponse: mongoose.Schema.Types.Mixed
  }],
  completedAt: Date,
  failedAt: Date,
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ order: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ method: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Generate payment ID
paymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.paymentId) {
    this.paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

// Method to mark as completed
paymentSchema.methods.markCompleted = function(gatewayResponse) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.gateway.gatewayResponse = gatewayResponse;
  return this.save();
};

// Method to mark as failed
paymentSchema.methods.markFailed = function(errorMessage, gatewayResponse) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.attempts.push({
    status: 'failed',
    errorMessage,
    gatewayResponse
  });
  return this.save();
};

// Method to add attempt
paymentSchema.methods.addAttempt = function(status, errorMessage, gatewayResponse) {
  this.attempts.push({
    status,
    errorMessage,
    gatewayResponse
  });
  return this.save();
};

export default mongoose.model('Payment', paymentSchema);