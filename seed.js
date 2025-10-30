import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import Product from './models/Product.js';

dotenv.config();

// Données de test pour les utilisateurs
const seedUsers = [
  {
    firstName: 'Admin',
    lastName: 'FastDeal',
    email: 'admin@fastdeal.com',
    password: 'Admin123!',
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    phone: '+225123456789',
    location: {
      country: 'Côte d\'Ivoire',
      city: 'Abidjan',
      address: 'Plateau, Abidjan'
    }
  },
  {
    firstName: 'Jean',
    lastName: 'Kouassi',
    email: 'jean.kouassi@example.com',
    password: 'User123!',
    role: 'user',
    isActive: true,
    isEmailVerified: true,
    phone: '+225987654321',
    location: {
      country: 'Côte d\'Ivoire',
      city: 'Abidjan',
      address: 'Cocody, Abidjan'
    }
  },
  {
    firstName: 'Aminata',
    lastName: 'Diallo',
    email: 'aminata.diallo@example.com',
    password: 'User123!',
    role: 'user',
    isActive: true,
    isEmailVerified: true,
    phone: '+221123456789',
    location: {
      country: 'Sénégal',
      city: 'Dakar',
      address: 'Plateau, Dakar'
    }
  }
];

// Données de test pour les produits
const seedProducts = [
  {
    name: 'iPhone 13 Pro - 256GB',
    description: 'iPhone 13 Pro en excellent état, très peu utilisé. Livré avec tous les accessoires d\'origine.',
    category: 'smartphone',
    brand: 'Apple',
    model: 'iPhone 13 Pro',
    condition: 'excellent',
    price: 899,
    originalPrice: 1099,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/007bff/ffffff?text=iPhone+13+Pro',
        alt: 'iPhone 13 Pro - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      storage: '256GB',
      color: 'Bleu Alpin',
      batteryHealth: '95%',
      screenSize: '6.1 pouces',
      camera: '12MP Triple caméra'
    },
    tags: ['smartphone', 'apple', 'iphone', 'pro'],
    isValidated: true,
    isFeatured: true,
    status: 'active'
  },
  {
    name: 'MacBook Air M2 - 512GB',
    description: 'MacBook Air avec puce M2, utilisé pendant 6 mois seulement. Parfait pour le travail et les études.',
    category: 'laptop',
    brand: 'Apple',
    model: 'MacBook Air M2',
    condition: 'very-good',
    price: 1299,
    originalPrice: 1499,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/28a745/ffffff?text=MacBook+Air+M2',
        alt: 'MacBook Air M2 - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      processor: 'Apple M2',
      storage: '512GB SSD',
      ram: '16GB',
      screenSize: '13.6 pouces',
      color: 'Gris Sidéral'
    },
    tags: ['laptop', 'apple', 'macbook', 'M2'],
    isValidated: true,
    isFeatured: true,
    status: 'active'
  },
  {
    name: 'Samsung Galaxy S23 Ultra',
    description: 'Samsung Galaxy S23 Ultra en très bon état, avec S Pen inclus. Idéal pour la productivité mobile.',
    category: 'smartphone',
    brand: 'Samsung',
    model: 'Galaxy S23 Ultra',
    condition: 'very-good',
    price: 799,
    originalPrice: 1199,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/ffc107/000000?text=Galaxy+S23+Ultra',
        alt: 'Samsung Galaxy S23 Ultra - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      storage: '256GB',
      color: 'Phantom Black',
      ram: '12GB',
      screenSize: '6.8 pouces',
      camera: '200MP Quad caméra'
    },
    tags: ['smartphone', 'samsung', 'galaxy', 's23'],
    isValidated: true,
    status: 'active'
  },
  {
    name: 'iPad Pro 11" M2',
    description: 'iPad Pro avec puce M2, parfait pour le design et la création de contenu. Clavier Magic Keyboard inclus.',
    category: 'tablet',
    brand: 'Apple',
    model: 'iPad Pro 11"',
    condition: 'excellent',
    price: 699,
    originalPrice: 899,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/17a2b8/ffffff?text=iPad+Pro+M2',
        alt: 'iPad Pro M2 - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      processor: 'Apple M2',
      storage: '128GB',
      screenSize: '11 pouces',
      connectivity: 'Wi-Fi + Cellular',
      color: 'Space Gray'
    },
    tags: ['tablet', 'apple', 'ipad', 'pro'],
    isValidated: true,
    status: 'active'
  },
  {
    name: 'Dell XPS 13 Plus',
    description: 'Ultrabook Dell XPS 13 Plus avec écran OLED. Parfait pour les professionnels et étudiants.',
    category: 'laptop',
    brand: 'Dell',
    model: 'XPS 13 Plus',
    condition: 'good',
    price: 999,
    originalPrice: 1399,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/6f42c1/ffffff?text=Dell+XPS+13',
        alt: 'Dell XPS 13 Plus - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      processor: 'Intel Core i7-1260P',
      storage: '512GB SSD',
      ram: '16GB',
      screenSize: '13.4 pouces OLED',
      graphics: 'Intel Iris Xe'
    },
    tags: ['laptop', 'dell', 'xps', 'ultrabook'],
    isValidated: true,
    status: 'active'
  },
  {
    name: 'Apple Watch Series 8',
    description: 'Apple Watch Series 8 avec boîtier en aluminium et bracelet sport. Suivi de santé avancé.',
    category: 'smartwatch',
    brand: 'Apple',
    model: 'Watch Series 8',
    condition: 'very-good',
    price: 299,
    originalPrice: 429,
    images: [
      {
        url: 'https://via.placeholder.com/600x600/dc3545/ffffff?text=Apple+Watch+S8',
        alt: 'Apple Watch Series 8 - Vue principale',
        isPrimary: true
      }
    ],
    specifications: {
      size: '45mm',
      color: 'Minuit',
      connectivity: 'GPS + Cellular',
      battery: 'Jusqu\'à 18h',
      sensors: 'ECG, Oxygène sanguin'
    },
    tags: ['smartwatch', 'apple', 'watch', 'health'],
    isValidated: true,
    status: 'active'
  }
];

async function seedDatabase() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fastdeal');
    console.log('✅ Connecté à MongoDB');

    // Supprimer les données existantes
    await User.deleteMany({});
    await Product.deleteMany({});
    console.log('🗑️ Données existantes supprimées');

    // Hasher les mots de passe
    for (const user of seedUsers) {
      user.password = await bcrypt.hash(user.password, 12);
    }

    // Créer les utilisateurs
    const createdUsers = await User.insertMany(seedUsers);
    console.log(`👥 ${createdUsers.length} utilisateurs créés`);

    // Assigner des vendeurs aléatoirement aux produits
    const userIds = createdUsers.filter(user => user.role === 'user').map(user => user._id);
    const adminId = createdUsers.find(user => user.role === 'admin')._id;

    for (const product of seedProducts) {
      // Assigner un vendeur aléatoire (ou admin si pas d'utilisateurs)
      product.seller = userIds.length > 0 
        ? userIds[Math.floor(Math.random() * userIds.length)]
        : adminId;
      
      product.validatedBy = adminId;
      product.validatedAt = new Date();
    }

    // Créer les produits
    const createdProducts = await Product.insertMany(seedProducts);
    console.log(`📦 ${createdProducts.length} produits créés`);

    console.log('\\n🎉 Base de données initialisée avec succès !');
    console.log('\\n📋 Comptes de test créés :');
    console.log('👨‍💼 Admin: admin@fastdeal.com / Admin123!');
    console.log('👤 Utilisateur 1: jean.kouassi@example.com / User123!');
    console.log('👤 Utilisateur 2: aminata.diallo@example.com / User123!');

  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Déconnecté de MongoDB');
    process.exit(0);
  }
}

// Exécuter le seeding
seedDatabase();