import express from 'express';
import Product from '../models/Product.js';
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
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images Only!');
    }
  }
});

// Routes publiques pour les tests admin (MODE DÉVELOPPEMENT UNIQUEMENT)
if (process.env.NODE_ENV === 'development') {
  
  // GET /api/admin-dev/products - Récupérer tous les produits (public)
  router.get('/products', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const query = {};
      
      // Filtres optionnels
      if (req.query.search) {
        query.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
          { brand: { $regex: req.query.search, $options: 'i' } }
        ];
      }
      
      if (req.query.category && req.query.category !== 'all') {
        query.category = req.query.category;
      }
      
      const products = await Product.find(query)
        .populate('seller', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Product.countDocuments(query);
      const pages = Math.ceil(total / limit);
      
      res.json({
        success: true,
        products,
        pagination: {
          current: page,
          pages,
          total,
          limit
        }
      });
      
    } catch (error) {
      console.error('Erreur lors de la récupération des produits:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur serveur',
        message: error.message
      });
    }
  });

  // POST /api/admin-dev/products - Créer un produit (public)
  router.post('/products', async (req, res) => {
    try {
      const productData = {
        ...req.body,
        seller: 'dev-admin-user-id', // ID fictif pour les tests
        isValidated: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const product = new Product(productData);
      await product.save();
      
      res.status(201).json({
        success: true,
        message: 'Produit créé avec succès',
        product
      });
      
    } catch (error) {
      console.error('Erreur lors de la création du produit:', error);
      res.status(400).json({
        success: false,
        error: 'Erreur lors de la création',
        message: error.message
      });
    }
  });

  // PUT /api/admin-dev/products/:id - Modifier un produit (public)
  router.put('/products/:id', async (req, res) => {
    try {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).populate('seller', 'firstName lastName email');

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Produit non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Produit modifié avec succès',
        product
      });
      
    } catch (error) {
      console.error('Erreur lors de la modification du produit:', error);
      res.status(400).json({
        success: false,
        error: 'Erreur lors de la modification',
        message: error.message
      });
    }
  });

  // DELETE /api/admin-dev/products/:id - Supprimer un produit (public)
  router.delete('/products/:id', async (req, res) => {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Produit non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Produit supprimé avec succès'
      });
      
    } catch (error) {
      console.error('Erreur lors de la suppression du produit:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la suppression',
        message: error.message
      });
    }
  });

  // POST /api/admin-dev/products/upload - Upload d'images (public)
  router.post('/products/upload', upload.array('images', 5), (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Aucun fichier uploadé'
        });
      }

      const uploadedFiles = req.files.map(file => ({
        url: `/uploads/products/${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size
      }));

      res.json({
        success: true,
        message: 'Images uploadées avec succès',
        files: uploadedFiles
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'upload',
        message: error.message
      });
    }
  });

}

export default router;