// --- Dépendances et initialisation serveur ---
const express = require("express");
const http = require("node:http");
const socketIo = require("socket.io");
const path = require("node:path");
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// --- Projectiles et explosions ---
let projectiles = [];
const PROJECTILE_SPEED = 18;
const PROJECTILE_RADIUS = 8;
const PROJECTILE_COOLDOWN = 5000;

// Gestion de l'attaque d'un joueur
io.on("connection", (socket) => {
	// Dash synchronisé (évite le "rollback" de position)
	socket.on('playerDash', (data) => {
		const player = gameState.players[socket.id];
		if (!player || !player.alive || !gameState.gameActive) return;
		// Appliquer le dash côté serveur
		const dashDist = typeof data.dist === 'number' ? data.dist : 480;
		const dashAngle = typeof data.angle === 'number' ? data.angle : (player.angle || 0);
		player.x += Math.cos(dashAngle) * dashDist;
		player.y += Math.sin(dashAngle) * dashDist;
		// Limiter aux bords de l'arène
		player.x = Math.max(player.radius, Math.min(1400 - player.radius, player.x));
		player.y = Math.max(player.radius, Math.min(1000 - player.radius, player.y));
		player.dashActive = true;
		setTimeout(() => { player.dashActive = false; }, 300);
		// Mise à jour immédiate pour tous
		io.emit('gameStateUpdate', { players: gameState.players });
	});
	// Activation du shield (depuis le client)
	socket.on('playerShield', () => {
		const player = gameState.players[socket.id];
		if (!player || !player.alive || !gameState.gameActive) return;
		if (player.shieldActive) return; // déjà actif
		player.shieldActive = true;
		io.emit('shieldActivated', { id: socket.id });
		setTimeout(() => {
			player.shieldActive = false;
		}, 2000);
	});
	socket.on('playerAttack', (data) => {
		const player = gameState.players[socket.id];
		if (!player || !player.alive || !gameState.gameActive) return;
		// Vérifier cooldown (simple, côté serveur)
		if (player.lastAttack && Date.now() - player.lastAttack < PROJECTILE_COOLDOWN) return;
		player.lastAttack = Date.now();
		// Créer le projectile
		projectiles.push({
			x: data.x,
			y: data.y,
			angle: data.angle,
			owner: socket.id,
			alive: true
		});
	});
});

function updateProjectiles() {
	for (const proj of projectiles) {
		if (!proj.alive) continue;
		proj.x += Math.cos(proj.angle) * PROJECTILE_SPEED;
		proj.y += Math.sin(proj.angle) * PROJECTILE_SPEED;
		// Hors de l'arène
		if (proj.x < 0 || proj.x > 1400 || proj.y < 0 || proj.y > 1000) {
			proj.alive = false;
			continue;
		}
		// Collision avec joueurs
		for (const id in gameState.players) {
			const p = gameState.players[id];
			if (!p.alive || id === proj.owner) continue;
			// Bouclier : invulnérable
			if (p.shieldActive) continue;
			const dx = proj.x - p.x;
			const dy = proj.y - p.y;
			if (Math.sqrt(dx*dx + dy*dy) < (p.radius + PROJECTILE_RADIUS)) {
				p.alive = false;
				proj.alive = false;
				io.emit('playerDied', { id: p.id, name: p.name });
				io.emit('explosion', { x: p.x, y: p.y });
				break;
			}
		}
		// Collision avec météorites
		for (const enemy of gameState.enemies) {
			const dx = proj.x - enemy.x;
			const dy = proj.y - enemy.y;
			if (Math.sqrt(dx*dx + dy*dy) < (enemy.radius + PROJECTILE_RADIUS)) {
				proj.alive = false;
				// Explosion sur la météorite
				io.emit('explosion', { x: enemy.x, y: enemy.y });
				// Détruire la météorite
				enemy.x = -9999; // la retirer de l'arène
				enemy.y = -9999;
				break;
			}
		}
	}
	// Nettoyer les projectiles morts
	projectiles = projectiles.filter(p => p.alive);
}
// --- Gestion des bots solo ---
const BOT_COUNT = 3;
function addBotsIfSolo() {
	const humanPlayers = Object.values(gameState.players).filter(p => !p.isBot);
	const botPlayers = Object.values(gameState.players).filter(p => p.isBot);
	if (humanPlayers.length === 1 && botPlayers.length === 0) {
	// Liste de pseudos randoms pour bots
	const botNames = [
		"Nova", "Orion", "Vega", "Cosmo", "Stella", "Luna", "Astro", "Zenith", "Comet", "Atlas",
		"Lyra", "Sirius", "Andro", "Rhea", "Titan", "Juno", "Sol", "Kepler", "Hubble", "Apollo"
	];
	for (let i = 0; i < BOT_COUNT; i++) {
		const botId = 'bot_' + Math.random().toString(36).slice(2, 10);
		const randomName = botNames.splice(Math.floor(Math.random() * botNames.length), 1)[0];
		gameState.players[botId] = {
			id: botId,
			name: randomName,
			alive: true,
			isBot: true,
		   x: Math.random() * 1200 + 100,
		   y: Math.random() * 800 + 100,
			radius: 15,
			color: '#ffb300',
			angle: 0,
			botTarget: null,
			botMoveTimer: 0,
			botMoveDir: {dx: 0, dy: 0}
		};
	}
		io.emit("gameStateUpdate", { players: gameState.players });
	}
}

function removeBots() {
	for (const id in gameState.players) {
		if (gameState.players[id].isBot) delete gameState.players[id];
	}
}

function moveBots() {
	for (const id in gameState.players) {
		const bot = gameState.players[id];
		if (!bot.isBot || !bot.alive || !gameState.gameActive) continue;
		// --- IA : capacité spéciale ---
		// Capacité : activation auto toutes les 5s si prête
		if (bot.capacityReady) {
			bot.capacityReady = false;
			setTimeout(() => { bot.capacityReady = true; }, 5000);
			if (bot.capacity === 'attack') {
				// Attaque le joueur le plus proche
				let target = null;
				let minDist = 9999;
				for (const id2 in gameState.players) {
					if (id2 === id) continue;
					const p2 = gameState.players[id2];
					if (!p2.alive) continue;
					const dx = p2.x - bot.x;
					const dy = p2.y - bot.y;
					const dist = Math.sqrt(dx*dx + dy*dy);
					if (dist < minDist) { minDist = dist; target = p2; }
				}
				if (target && minDist < 400) {
					const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
					projectiles.push({
						x: bot.x + Math.cos(angle) * (bot.radius+10),
						y: bot.y + Math.sin(angle) * (bot.radius+10),
						angle,
						owner: id,
						alive: true
					});
				}
			} else if (bot.capacity === 'shield') {
			   bot.shieldActive = true;
			   setTimeout(() => { bot.shieldActive = false; }, 2000);
			} else if (bot.capacity === 'dash') {
				bot.dashActive = true;
				// Dash dans la direction actuelle du bot (plus "en avant")
				const dashDist = 320;
				const angle = bot.angle || 0;
				bot.x += Math.cos(angle) * dashDist;
				bot.y += Math.sin(angle) * dashDist;
				setTimeout(() => { bot.dashActive = false; }, 300);
			}
		}
		// --- IA de déplacement classique ---
		const speed = 2.5; // aligné avec la vitesse joueur
		let avoid = {dx: 0, dy: 0};
		let threatCount = 0;
		for (const enemy of gameState.enemies) {
			const dx = bot.x - enemy.x;
			const dy = bot.y - enemy.y;
			const dist = Math.sqrt(dx*dx + dy*dy);
			if (dist < 120) {
				avoid.dx += dx / dist;
				avoid.dy += dy / dist;
				threatCount++;
			}
		}
		if (threatCount > 0) {
			avoid.dx /= threatCount;
			avoid.dy /= threatCount;
			avoid.dx += (Math.random()-0.5)*0.3;
			avoid.dy += (Math.random()-0.5)*0.3;
			const norm = Math.sqrt(avoid.dx*avoid.dx + avoid.dy*avoid.dy) || 1;
			bot.botMoveDir.dx = avoid.dx / norm;
			bot.botMoveDir.dy = avoid.dy / norm;
			bot.botMoveTimer = 10 + Math.floor(Math.random()*10);
		} else if (bot.botMoveTimer <= 0) {
			const angle = Math.random() * 2 * Math.PI;
			bot.botMoveDir.dx = Math.cos(angle);
			bot.botMoveDir.dy = Math.sin(angle);
			bot.botMoveTimer = 21 + Math.floor(Math.random() * 18);
		}
		bot.botMoveTimer--;
		bot.x += bot.botMoveDir.dx * speed;
		bot.y += bot.botMoveDir.dy * speed;
		if (bot.x < bot.radius) {
			bot.x = bot.radius;
			bot.botMoveDir.dx *= -1;
		}
		if (bot.x > 1400 - bot.radius) {
			bot.x = 1400 - bot.radius;
			bot.botMoveDir.dx *= -1;
		}
		if (bot.y < bot.radius) {
			bot.y = bot.radius;
			bot.botMoveDir.dy *= -1;
		}
		if (bot.y > 1000 - bot.radius) {
			bot.y = 1000 - bot.radius;
			bot.botMoveDir.dy *= -1;
		}
		bot.angle = Math.atan2(bot.botMoveDir.dy, bot.botMoveDir.dx);
		if (!bot._turboAnim) bot._turboAnim = { t: 0 };
		if (bot.botMoveDir.dx !== 0 || bot.botMoveDir.dy !== 0) {
			bot._turboAnim.t = 8;
		}
		if (bot._turboAnim.t > 0) bot._turboAnim.t--;
		bot.moving = (bot.botMoveDir.dx !== 0 || bot.botMoveDir.dy !== 0) || bot._turboAnim.t > 0;
	}
}

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, "public")));

// Route principale
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Structure de données pour le jeu
const CAPACITIES = ['attack', 'shield', 'dash'];
const gameState = {
	players: {},
	enemies: [],
	gameActive: false,
	gameStartTime: null,
};

let startTimer = null;
const MIN_PLAYERS = 2;
const START_DELAY = 10000; // 10 secondes

// Gestion des connexions Socket.IO
io.on("connection", (socket) => {
	console.log("Un joueur s'est connecté:", socket.id);

	   // Logique de connexion d'un nouveau joueur
   socket.on("joinGame", (playerData) => {
	   console.log("Nouveau joueur veut rejoindre:", playerData);
	   // Attribuer une capacité aléatoire
	   const capacity = CAPACITIES[Math.floor(Math.random() * CAPACITIES.length)];
	   // Ajouter le joueur à gameState
	   gameState.players[socket.id] = {
		   id: socket.id,
		   name: playerData.name,
		   alive: true,
		   x: Math.random() * 1200 + 100,
		   y: Math.random() * 800 + 100,
		   radius: 15,
		   color: typeof playerData.color === 'string' ? playerData.color : '#4CAF50',
		   angle: 0,
		   capacity,
		   capacityReady: true, // Pour cooldown
		   shieldActive: false,
		   dashActive: false,
		   lastCapacityUse: 0
	   };
	   // Informer tous les clients du nouveau joueur
	   io.emit("playerJoined", { id: socket.id, name: playerData.name, capacity });
	   // Envoyer l'état du lobby à tous
	   io.emit("gameStateUpdate", { players: gameState.players });

	   // Gestion du mode solo/multi
	   if (playerData.mode === 'solo') {
		   addBotsIfSolo();
		   gameState.gameActive = true;
		   gameState.gameStartTime = Date.now();
		   attribuerCapacitesBots();
		   io.emit("gameStarted", { capacities: getAllCapacities(), mode: 'solo' });
	   } else {
		   // En multijoueur, PAS de bots !
		   const playerCount = Object.values(gameState.players).filter(p => !p.isBot).length;
		   if (playerCount >= MIN_PLAYERS && !gameState.gameActive && !startTimer) {
			   console.log(`Assez de joueurs, démarrage dans 10s...`);
			   startTimer = setTimeout(() => {
				   if (Object.values(gameState.players).filter(p => !p.isBot).length >= MIN_PLAYERS && !gameState.gameActive) {
					   gameState.gameActive = true;
					   gameState.gameStartTime = Date.now();
					   // PAS de bots ici !
					   io.emit("gameStarted", { capacities: getAllCapacities(), mode: 'multi' });
				   }
				   startTimer = null;
			   }, START_DELAY);
			   io.emit("gameStateUpdate", { players: gameState.players, countdown: 10 });
		   }
	   }
   });

// Attribuer une capacité aléatoire à chaque bot
function attribuerCapacitesBots() {
	for (const id in gameState.players) {
		const p = gameState.players[id];
		if (p.isBot) {
			p.capacity = CAPACITIES[Math.floor(Math.random() * CAPACITIES.length)];
			p.capacityReady = true;
			p.shieldActive = false;
			p.dashActive = false;
			p.lastCapacityUse = 0;
		}
	}
}

// Récupérer la capacité de tous les joueurs/bots pour l'affichage client
function getAllCapacities() {
	const res = {};
	for (const id in gameState.players) {
		res[id] = gameState.players[id].capacity;
	}
	return res;
}

	   // Gestion des mouvements du joueur
   socket.on("playerMove", (moveData) => {
		   // Appliquer le déplacement au joueur correspondant
		   const player = gameState.players[socket.id];
		   if (player && player.alive && gameState.gameActive) {
				   player.x += moveData.dx;
				   player.y += moveData.dy;
				   // Limiter aux bords du canvas
				   player.x = Math.max(player.radius, Math.min(1400 - player.radius, player.x));
				   player.y = Math.max(player.radius, Math.min(1000 - player.radius, player.y));
				   // Calculer l'angle de direction si déplacement
				   if (moveData.dx !== 0 || moveData.dy !== 0) {
					   player.angle = Math.atan2(moveData.dy, moveData.dx);
				   }
		   }
   });
// Commande /start dans la console serveur
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (input) => {
	   if (input.trim() === '/start') {
			   // Réinitialiser tous les joueurs et ennemis
			   for (const id in gameState.players) {
					   gameState.players[id].alive = true;
					   gameState.players[id].x = Math.random() * 700 + 50;
					   gameState.players[id].y = Math.random() * 500 + 50;
					   gameState.players[id].angle = 0;
			   }
			   gameState.enemies = [];
			   gameState.gameActive = true;
			   gameState.gameStartTime = Date.now();
			   io.emit("gameStarted");
			   console.log("Partie démarrée manuellement !");
	   }
});

	   // Déconnexion d'un joueur
	   socket.on("disconnect", () => {
		// Si un humain quitte, retirer les bots si plus de 1 humain
		setTimeout(() => {
			const humanPlayers = Object.values(gameState.players).filter(p => !p.isBot);
			if (humanPlayers.length !== 1) removeBots();
		}, 500);
			   console.log("Un joueur s'est déconnecté:", socket.id);
			   if (gameState.players[socket.id]) {
					   const playerName = gameState.players[socket.id].name;
					   delete gameState.players[socket.id];
					   io.emit("playerLeft", { id: socket.id, name: playerName });
					   io.emit("gameStateUpdate", { players: gameState.players });
			   }
			   // Si moins de MIN_PLAYERS, annuler le timer
			   if (Object.keys(gameState.players).length < MIN_PLAYERS && startTimer) {
					   clearTimeout(startTimer);
					   startTimer = null;
					   console.log("Pas assez de joueurs, timer annulé.");
			   }
	   });
});


// Génération simple d'ennemis (exemple)
function spawnEnemies() {
	if (!gameState.gameActive) return;
	// Ajoute un ennemi toutes les 2 secondes (exemple)
	// Empêcher le spawn kill en solo : ne pas faire apparaître d'ennemi trop près d'un joueur humain
	let safe = false;
	let x, y;
	let tries = 0;
	while (!safe && tries < 20) {
		x = Math.random() * 1200 + 100;
		y = Math.random() * 800 + 100;
		safe = true;
		for (const id in gameState.players) {
			const p = gameState.players[id];
			if (!p.alive || p.isBot) continue;
			const dx = x - p.x;
			const dy = y - p.y;
			if (Math.sqrt(dx*dx + dy*dy) < 120) { // 120px de sécurité
				safe = false;
				break;
			}
		}
		tries++;
	}
	gameState.enemies.push({
		x,
		y,
		radius: 10,
		color: '#F44336',
		vx: (Math.random() - 0.5) * 4,
		vy: (Math.random() - 0.5) * 4,
	});
}

// Mise à jour du jeu (déplacement ennemis, etc.)
function updateGame() {
	// Déplacement automatique des bots
	moveBots();
	if (!gameState.gameActive) return;
	updateProjectiles();
	io.emit('projectilesUpdate', { projectiles });

	// Déplacer les ennemis
	for (const enemy of gameState.enemies) {
		enemy.x += enemy.vx;
		enemy.y += enemy.vy;
		// rebondir sur les bords
		if (enemy.x < enemy.radius || enemy.x > 800 - enemy.radius) enemy.vx *= -1;
		if (enemy.y < enemy.radius || enemy.y > 600 - enemy.radius) enemy.vy *= -1;
	}

	// Vérifier collisions joueur/virus
	for (const id in gameState.players) {
		const player = gameState.players[id];
		if (!player.alive) continue;
		for (const enemy of gameState.enemies) {
			const dx = player.x - enemy.x;
			const dy = player.y - enemy.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < (player.radius + enemy.radius)) {
				// Si le bouclier est actif, ignorer la mort
				if (player.shieldActive) continue;
				player.alive = false;
				io.emit("playerDied", { id: player.id, name: player.name });
				// NE PAS retirer le joueur du canvas, il passe en mode spectateur
				break;
			}
		}
	}

	// Vérifier si un seul joueur vivant (fin de partie)
	const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
	if (alivePlayers.length <= 1 && gameState.gameActive) {
		gameState.gameActive = false;
		let winner = null;
		if (alivePlayers.length === 1) {
			winner = alivePlayers[0].name;
		}
		io.emit("gameEnded", { winner });
	}

	// Envoyer l'état du jeu à tous les clients
	io.emit("gameStateUpdate", {
		players: gameState.players,
		enemies: gameState.enemies,
		gameStartTime: gameState.gameStartTime,
		gameActive: gameState.gameActive
	});
}

// Boucle de jeu
setInterval(() => {
	if (gameState.gameActive) {
		updateGame();
	}
}, 1000/30); // 30 FPS

// Boucle de génération d'ennemis
setInterval(() => {
	if (gameState.gameActive) {
		spawnEnemies();
	}
}, 2000);

server.listen(PORT, () => {
	console.log(`Serveur démarré sur le port ${PORT}`);
});
