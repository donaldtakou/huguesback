import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Créer le dossier uploads/products s'il n'existe pas
const uploadsDir = path.join(__dirname, '../uploads/products/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Fonction pour convertir image en Base64
const convertToBase64 = (filePath) => {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Déterminer le MIME type
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff'
    };
    
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    const base64String = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64String}`;
  } catch (error) {
    console.error('❌ Erreur conversion Base64:', error);
    return null;
  }
};

// Configuration multer pour tous les formats d'images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = 'product-' + uniqueSuffix + extension;
    console.log('📁 Saving image as:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB pour supporter tous les formats
  },
  fileFilter: function (req, file, cb) {
    // Extensions autorisées (formats d'images courants)
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
      cb(new Error(`Format non supporté. Formats acceptés: JPEG, JPG, PNG, WebP, GIF, SVG, BMP, TIFF, ICO`));
    }
  }
});

// Route pour upload d'une seule image (recommandé pour l'admin)
router.post('/single', upload.single('image'), (req, res) => {
  try {
    console.log('📤 Single image upload request received');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucune image reçue' 
      });
    }

    const imageUrl = `http://localhost:5000/uploads/products/${req.file.filename}`;
    const filePath = req.file.path;
    const base64Data = convertToBase64(filePath);
    
    console.log('🖼️ Single image saved:', imageUrl);
    console.log('📊 Base64 generated:', base64Data ? 'Success' : 'Failed');

    res.json({
      success: true,
      message: 'Image uploadée avec succès',
      image: {
        url: imageUrl,
        base64: base64Data,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        format: path.extname(req.file.originalname).toLowerCase()
      }
    });

  } catch (error) {
    console.error('❌ Single upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'upload de l\'image',
      error: error.message
    });
  }
});

// Route pour upload d'images multiples
router.post('/upload', upload.array('images', 10), (req, res) => {
  try {
    console.log('📤 Multiple images upload request received');
    console.log('Files received:', req.files?.length || 0);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucune image reçue' 
      });
    }

    // Créer les URLs pour les images uploadées
    const imageUrls = req.files.map(file => {
      const imageUrl = `http://localhost:5000/uploads/products/${file.filename}`;
      console.log('🖼️ Image saved:', imageUrl);
      return {
        url: imageUrl,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        format: path.extname(file.originalname).toLowerCase(),
        isPrimary: false
      };
    });

    // Marquer la première image comme principale
    if (imageUrls.length > 0) {
      imageUrls[0].isPrimary = true;
    }

    console.log('✅ Upload successful, returning URLs:', imageUrls.length);

    res.json({
      success: true,
      message: `${imageUrls.length} image(s) uploadée(s) avec succès`,
      images: imageUrls
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'upload des images',
      error: error.message
    });
  }
});

// Route pour lister les images disponibles
router.get('/images', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'].includes(ext);
    });

    const images = imageFiles.map(file => ({
      filename: file,
      url: `http://localhost:5000/uploads/products/${file}`,
      size: fs.statSync(path.join(uploadsDir, file)).size,
      format: path.extname(file).toLowerCase()
    }));

    res.json({
      success: true,
      message: `${images.length} images trouvées`,
      images: images
    });

  } catch (error) {
    console.error('❌ List images error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la liste des images',
      error: error.message
    });
  }
});

// Route pour supprimer une image
router.delete('/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log('🗑️ Image deleted:', filename);
      res.json({ 
        success: true, 
        message: 'Image supprimée avec succès',
        filename: filename
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Image non trouvée',
        filename: filename
      });
    }
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la suppression',
      error: error.message
    });
  }
});

export default router;