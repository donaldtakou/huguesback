import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: {
      values: ['smartphone', 'tablet', 'smartwatch', 'laptop', 'desktop', 'accessory', 'other'],
      message: 'Invalid category'
    }
  },
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Model is required'],
    trim: true
  },
  condition: {
    type: String,
    required: [true, 'Condition is required'],
    enum: {
      values: ['excellent', 'very-good', 'good', 'fair', 'poor'],
      message: 'Invalid condition'
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    min: [0, 'Original price cannot be negative']
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: ''
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  specifications: {
    storage: String,
    ram: String,
    screenSize: String,
    processor: String,
    operatingSystem: String,
    color: String,
    warranty: String,
    batteryHealth: String,
    accessories: [String]
  },
  availability: {
    type: String,
    enum: ['in-stock', 'out-of-stock', 'reserved'],
    default: 'in-stock'
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  isValidated: {
    type: Boolean,
    default: false
  },
  validatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  validatedAt: {
    type: Date
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  tags: [String],
  location: {
    city: String,
    region: String,
    country: {
      type: String,
      default: 'France'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

// Index for search optimization
productSchema.index({ name: 'text', description: 'text', brand: 'text', model: 'text' });
productSchema.index({ category: 1, condition: 1, price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ views: -1 });

// Pre-save middleware to ensure only one primary image
productSchema.pre('save', function(next) {
  if (this.images && this.images.length > 0) {
    let primaryCount = 0;
    this.images.forEach((image, index) => {
      if (image.isPrimary) {
        primaryCount++;
        if (primaryCount > 1) {
          image.isPrimary = false;
        }
      }
    });
    
    // If no primary image, set the first one as primary
    if (primaryCount === 0) {
      this.images[0].isPrimary = true;
    }
  }
  next();
});

const Product = mongoose.model('Product', productSchema);

export default Product;