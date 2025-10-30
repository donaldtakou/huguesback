# Guide d'Installation Rapide - FastDeal Backend

## 🚀 Installation en 5 Minutes

### 1. Prérequis
- Node.js v16+ installé
- MongoDB en local ou compte MongoDB Atlas
- Git installé

### 2. Cloner et Installer
```bash
# Cloner le projet
git clone <votre-repo-url>
cd fastdeal-backend

# Installer les dépendances
npm install
```

### 3. Configuration Minimale
```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer le fichier .env avec vos valeurs
# Au minimum, configurez :
# - MONGODB_URI
# - JWT_SECRET
```

### 4. Générer une clé JWT sécurisée
```bash
# Dans Node.js ou votre navigateur :
require('crypto').randomBytes(64).toString('hex')
```

### 5. Lancer l'application
```bash
# Mode développement avec rechargement automatique
npm run dev

# Ou mode production
npm start
```

### 6. Peupler avec des données de test (optionnel)
```bash
npm run seed
```

## 🌐 Accès

- **API**: http://localhost:5000
- **Health Check**: http://localhost:5000/api/health
- **Test Compte Admin**: admin@fastdeal.com / Admin123!

## 📋 Configuration des Paiements (Plus tard)

### Orange Money
1. Créer un compte sur [Orange Developer](https://developer.orange.com)
2. Ajouter les clés dans `.env`:
   ```env
   ORANGE_MONEY_CLIENT_ID=votre_client_id
   ORANGE_MONEY_CLIENT_SECRET=votre_client_secret
   ```

### MTN Money
1. Créer un compte sur [MTN Developer](https://momodeveloper.mtn.com)
2. Ajouter les clés dans `.env`:
   ```env
   MTN_MONEY_API_KEY=votre_api_key
   MTN_MONEY_SUBSCRIPTION_KEY=votre_subscription_key
   ```

### Stripe
1. Créer un compte sur [Stripe](https://stripe.com)
2. Ajouter les clés dans `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_votre_cle
   ```

### Cloudinary (Upload d'images)
1. Créer un compte sur [Cloudinary](https://cloudinary.com)
2. Ajouter les clés dans `.env`:
   ```env
   CLOUDINARY_CLOUD_NAME=votre_cloud_name
   CLOUDINARY_API_KEY=votre_api_key
   CLOUDINARY_API_SECRET=votre_api_secret
   ```

## 🐛 Dépannage Rapide

### Erreur de connexion MongoDB
```bash
# Vérifier que MongoDB est démarré
mongod

# Ou utiliser MongoDB Atlas avec une URI complète
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/fastdeal
```

### Erreur JWT
```bash
# Générer une nouvelle clé secrète
JWT_SECRET=votre_nouvelle_cle_tres_longue_et_securisee
```

### Port déjà utilisé
```bash
# Changer le port dans .env
PORT=5001
```

## 📚 Ressources

- **Documentation complète**: `README.md`
- **Variables d'environnement**: `.env.example`
- **Endpoints API**: Voir section API dans README.md
- **Support**: Créer une issue GitHub

## 🎯 Prochaines Étapes

1. ✅ Backend fonctionnel
2. 🔧 Configurer les paiements
3. 🎨 Connecter le frontend
4. 🚀 Déployer en production

---

**Note**: Ce guide permet de démarrer rapidement en mode développement. Pour la production, consultez la documentation complète.