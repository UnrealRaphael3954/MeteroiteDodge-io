# Virus Dodge - Jeu Multijoueur

Un jeu multijoueur en temps réel où les joueurs doivent éviter des virus qui apparaissent aléatoirement sur l'écran. Le dernier joueur survivant gagne la partie !

## Technologies utilisées

- **Backend** : Node.js, Express.js, Socket.IO
- **Frontend** : HTML5 Canvas, CSS3, JavaScript
- **Communication** : WebSockets via Socket.IO

## Installation

1. Clonez le repository
2. Installez les dépendances :
   ```bash
   npm install
   ```

3. Démarrez le serveur :
   ```bash
   npm start
   ```
   
   Ou pour le développement avec auto-reload :
   ```bash
   npm run dev
   ```

4. Ouvrez votre navigateur sur `http://localhost:3000`

## Structure du projet

```
virus-dodge-game/
├── server.js          # Serveur principal avec Socket.IO
├── package.json        # Configuration npm
├── README.md          # Ce fichier
└── public/            # Fichiers statiques
    ├── index.html     # Interface utilisateur
    ├── style.css      # Styles CSS
    └── client.js      # Logique côté client
```

## Fonctionnalités à implémenter

### 🎯 Objectifs pour les étudiants

Ce projet est conçu comme un exercice d'apprentissage. Les fonctionnalités de base sont mises en place, mais les étudiants devront compléter les implémentations suivantes :

#### Côté Serveur (`server.js`)

1. **Gestion des joueurs**
   - [ ] Implémenter `joinGame` : Ajouter un joueur à la partie
   - [ ] Implémenter `playerMove` : Mettre à jour la position d'un joueur
   - [ ] Implémenter `disconnect` : Retirer un joueur de la partie

2. **Logique de jeu**
   - [ ] Implémenter `spawnEnemies()` : Générer des ennemis aléatoirement
   - [ ] Implémenter `updateGame()` : Boucle principale du jeu
   - [ ] Détecter les collisions entre joueurs et ennemis
   - [ ] Gérer les conditions de fin de partie

3. **Communication temps réel**
   - [ ] Diffuser l'état du jeu à tous les clients
   - [ ] Gérer le démarrage et l'arrêt des parties

#### Côté Client (`client.js`)

1. **Interface utilisateur**
   - [ ] Compléter la fonction `joinGame()`
   - [ ] Implémenter l'envoi des mouvements au serveur
   - [ ] Mettre à jour l'affichage en temps réel

2. **Rendu graphique**
   - [ ] Dessiner les joueurs sur le canvas
   - [ ] Dessiner les ennemis (virus)
   - [ ] Animer les mouvements

3. **Gestion des événements Socket.IO**
   - [ ] Traiter les mises à jour de l'état du jeu
   - [ ] Gérer l'arrivée/départ des joueurs
   - [ ] Afficher les résultats de fin de partie

## Règles du jeu

- **Objectif** : Être le dernier joueur survivant
- **Contrôles** : Flèches directionnelles ou touches WASD
- **Ennemis** : Des virus rouges apparaissent aléatoirement
- **Progression** : Le nombre d'ennemis augmente progressivement
- **Collision** : Toucher un virus élimine le joueur

## Concepts techniques abordés

- **WebSockets** et communication en temps réel
- **Programmation événementielle** avec Socket.IO
- **Rendu graphique** avec HTML5 Canvas
- **Gestion d'état** partagé entre client et serveur
- **Détection de collision** en 2D
- **Architecture client-serveur** pour jeux multijoueur

## Extensions possibles

Une fois les fonctionnalités de base implémentées, les étudiants peuvent ajouter :

- Power-ups temporaires (vitesse, invincibilité)
- Différents types d'ennemis
- Système de score
- Spectateur pour les joueurs éliminés
- Salles de jeu privées
- Classement des joueurs

## Notes pour les instructeurs

- Les TODO dans le code indiquent clairement ce qui doit être complété
- La structure permet un développement progressif
- Les fonctions utilitaires sont fournies pour aider les étudiants
- Le design responsive fonctionne sur mobile et desktop

Bon développement ! 🎮
