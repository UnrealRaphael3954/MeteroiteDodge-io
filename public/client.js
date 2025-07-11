// Fonction pour mettre à jour dynamiquement les labels du HUD in-game
function updateGameInfoLabels() {
	const t = translations[lang] || translations.fr;
	const gameInfo = document.getElementById('gameInfo');
	if (gameInfo) {
		const spans = gameInfo.querySelectorAll('span');
		// Correction : bien cibler chaque label
		// Joueurs restants
		if (spans[0]?.children[0]) spans[0].children[0].textContent = `${t.players || 'Joueurs'}: `;
		// Temps
		if (spans[1]?.children[0]) spans[1].children[0].textContent = `${t.time || 'Temps'}: `;
		// Unité de temps ("s")
		const timeUnit = document.getElementById('gameTimeUnit');
		if (timeUnit) timeUnit.textContent = t.timeUnit || 's';
		// Ennemis
		if (spans[2]?.children[0]) spans[2].children[0].textContent = `${t.enemies || 'Ennemis'}: `;
	}
}
// Connexion Socket.IO
const socket = io();

// Éléments DOM
const loginScreen = document.getElementById("loginScreen");
const waitingScreen = document.getElementById("waitingScreen");
const gameScreen = document.getElementById("gameScreen");
const gameOverScreen = document.getElementById("gameOverScreen");

const playerNameInput = document.getElementById("playerName");
const playerColorInput = document.getElementById("playerColor");
const soloButton = document.getElementById("soloButton");
const multiButton = document.getElementById("multiButton");
const startButton = document.getElementById("startButton");
const playAgainButton = document.getElementById("playAgainButton");

const playerCountSpan = document.getElementById("playerCount");
const playersAliveSpan = document.getElementById("playersAlive");
const gameTimeSpan = document.getElementById("gameTime");
const enemyCountSpan = document.getElementById("enemyCount");
const gameResultH2 = document.getElementById("gameResult");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Variables du jeu
let gameState = {
	players: {},
	enemies: [],
	localPlayer: null,
	gameActive: false,
	localPlayerId: null, // Ajouté pour l'id local
};

// --- Système de langue ---
let lang = localStorage.getItem('lang') || 'fr';
let translations = {};
fetch('lang.json').then(r => r.json()).then(obj => {
	translations = obj;
	setLanguage(lang);
});

function setLanguage(l) {
	lang = l;
	localStorage.setItem('lang', l);
	const t = translations[l] || translations.fr;
	// Titres et labels principaux
	document.getElementById('mainTitle').textContent = t.title;
	document.getElementById('loginTitle').textContent = t.lobby || t.lobby || '';
	document.getElementById('pseudoLabel').textContent = t.pseudo ? `${t.pseudo} :` : '';
	document.getElementById('playerName').placeholder = t.pseudo;
	document.getElementById('colorLabel').innerHTML = `${t.color ? t.color : 'Couleur du vaisseau'} : <input type="color" id="playerColor" value="#4CAF50" style="margin-left: 8px; width: 40px; height: 32px; border: none; background: none;">`;
	document.getElementById('soloButton').textContent = t.solo;
	document.getElementById('multiButton').textContent = t.multi;
	document.getElementById('chooseLangLabel').textContent = t.chooseLang;
	// Afficher/cacher le sélecteur de langue uniquement sur l'écran login
	const langContainer = document.getElementById('langSelectContainer');
	if (document.getElementById('loginScreen').classList.contains('hidden')) {
		langContainer.style.display = 'none';
	} else {
		langContainer.style.display = 'flex';
	}
	// Écrans
	const waiting = document.getElementById('waitingScreen');
	if (waiting) waiting.querySelector('h2').textContent = t.waiting;
	const startBtn = document.getElementById('startButton');
	if (startBtn) startBtn.textContent = t.start;
	// Game info (in-game)
	updateGameInfoLabels();
	// Popup mort
	document.querySelector('#deathPopup h2').textContent = t.death;
	document.getElementById('deathSpectateButton').textContent = t.spectate;
	document.getElementById('deathPlayAgainButton').textContent = t.playAgain;
	// Fin de partie
	document.getElementById('playAgainButton').textContent = t.playAgain;
	// In-game résultat
	const gameResult = document.getElementById('gameResult');
	if (gameResult?.textContent) {
		// Remplacer le texte si c'est une victoire
		if (gameResult.textContent.includes('a gagné') || gameResult.textContent.includes('won') || gameResult.textContent.includes('ha vinto') || gameResult.textContent.includes('победил') || gameResult.textContent.includes('hat gewonnen') || gameResult.textContent.includes('ha ganado') || gameResult.textContent.includes('赢了') || gameResult.textContent.includes('が勝ちました')) {
			const winnerName = gameResult.textContent.split(' ')[0];
			gameResult.textContent = `${winnerName} ${t.winner || 'a gagné !'}`;
		} else {
			gameResult.textContent = t.gameOver;
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const langSelect = document.getElementById('langSelect');
	if (langSelect) {
		langSelect.value = lang;
		langSelect.onchange = (e) => setLanguage(e.target.value);
	}
});

// Afficher/cacher le sélecteur de langue selon l'écran
// SUPPRESSION de la double déclaration de showScreen

let lastAttackTime = 0;
let explosions = [];

let keys = {};

// Gestionnaires d'événements pour l'interface
soloButton.addEventListener("click", () => joinGame('solo'));
multiButton.addEventListener("click", () => joinGame('multi'));
startButton.addEventListener("click", startGame);
playAgainButton.addEventListener("click", () => {
	showScreen("loginScreen");
});


// Correction : validation par Entrée = Solo par défaut
playerNameInput.addEventListener("keypress", (e) => {
	if (e.key === "Enter") {
		joinGame('solo');
	}
});

// Fonction pour rejoindre la partie
function joinGame(mode) {
	const playerName = playerNameInput.value.trim();
	const playerColor = playerColorInput ? playerColorInput.value : '#4CAF50';
	if (playerName === "") {
		alert("Veuillez entrer votre nom");
		return;
	}
	// Sécurité : solo par défaut si non précisé
	const modeToSend = mode || 'solo';
	console.log("Tentative de connexion avec le nom:", playerName, "mode:", mode, "couleur:", playerColor);
	socket.emit('joinGame', { name: playerName, color: playerColor, mode: modeToSend });
	showScreen("waitingScreen");
}

// Fonction pour démarrer la partie
function startGame() {
	// TODO: Les étudiants devront implémenter l'envoi de signal au serveur
	console.log("Démarrage de la partie demandé");
	showScreen("gameScreen");
	initializeGame();
}

// Fonction pour afficher un écran spécifique
function showScreen(screenName) {
	for (const screen of document.querySelectorAll(".screen")) {
		screen.classList.add("hidden");
	}
	document.getElementById(screenName).classList.remove("hidden");
}

// Initialisation du jeu
function initializeGame() {
	gameState.gameActive = true;

	// Détecter le joueur local (celui qui a le même id que le socket)
	// On attend la première gameStateUpdate pour l'assigner
	gameState.localPlayerId = socket.id;

	// Démarrer la boucle de rendu
	gameLoop();
}

// Gestion des entrées clavier
document.addEventListener("keydown", (e) => {
	// Empêcher la répétition rapide de la touche (évite accélération anormale)
	if (e.repeat) return;
	keys[e.key] = true;
	const localId = gameState.localPlayerId;
	const player = gameState.players[localId];
	if (!player || !player.alive || !gameState.gameActive) return;
	// Capacité : activation avec ESPACE, cooldown 5s
	if (e.code === "Space" && player.capacityReady !== false) {
		player.capacityReady = false;
		setTimeout(() => { player.capacityReady = true; }, 5000);
		if (player.capacity === 'attack') {
			const angle = (typeof player.angle === 'number' ? player.angle : 0);
			const px = player.x + Math.cos(angle) * (player.radius+10);
			const py = player.y + Math.sin(angle) * (player.radius+10);
			socket.emit('playerAttack', { x: px, y: py, angle });
		} else if (player.capacity === 'shield') {
			// NE PAS modifier player.shieldActive côté client !
			socket.emit('playerShield');
		} else if (player.capacity === 'dash') {
			player.dashActive = true;
			const dashDist = 480;
			let dx = 0;
			let dy = 0;
			if (keys.ArrowUp || keys.z) dy -= 1;
			if (keys.ArrowDown || keys.s) dy += 1;
			if (keys.ArrowLeft || keys.q) dx -= 1;
			if (keys.ArrowRight || keys.d) dx += 1;
			let dashAngle;
			if (dx !== 0 || dy !== 0) {
				dashAngle = Math.atan2(dy, dx);
			} else {
				dashAngle = (typeof player.angle === 'number' ? player.angle : 0);
			}
			socket.emit('playerDash', { angle: dashAngle, dist: dashDist });
			player.x += Math.cos(dashAngle) * dashDist;
			player.y += Math.sin(dashAngle) * dashDist;
			setTimeout(() => { player.dashActive = false; }, 300);
		}
	}
});

// Réception de l'activation du shield depuis le serveur (synchronisation)
socket.on('shieldActivated', (data) => {
	if (gameState.players[data.id]) {
		gameState.players[data.id].shieldActive = true;
		if (data.id === gameState.localPlayerId) showShieldNotif();
		// Désactivation du shield côté client UNIQUEMENT si le serveur ne renvoie pas d'update (sécurité)
		setTimeout(() => {
			// Si le serveur n'a pas déjà désactivé le shield (par gameStateUpdate)
			if (gameState.players[data.id] && gameState.players[data.id].shieldActive) {
				gameState.players[data.id].shieldActive = false;
			}
		}, 2100);
	}
});
// Affiche une notif visuelle "Bouclier activé !" (multilingue)
function showShieldNotif() {
	const notif = document.getElementById('capacityNotif');
	const t = translations[lang] || translations.fr;
	notif.textContent = t.capacity_shield ? `${t.capacity_shield} !` : 'Bouclier activé !';
	notif.style.display = 'block';
	notif.style.background = 'rgba(0,120,255,0.92)';
	setTimeout(() => {
		notif.style.display = 'none';
		notif.style.background = 'rgba(30,30,40,0.92)';
	}, 1200);
}

document.addEventListener("keyup", (e) => {
keys[e.key] = false;
});

// Fonction pour gérer les entrées du joueur
function handlePlayerInput() {
	if (!gameState.gameActive) return;

	// Déplacement du joueur local (prediction locale pour la fluidité)
	let dx = 0;
	let dy = 0;

	// Vitesse unique pour solo et multi (identique aux bots)
	const speed = 1.2; // ralenti pour un déplacement plus lent
	if (keys.ArrowUp || keys.z) dy -= speed;
	if (keys.ArrowDown || keys.s) dy += speed;
	if (keys.ArrowLeft || keys.q) dx -= speed;
	if (keys.ArrowRight || keys.d) dx += speed;

	const localId = gameState.localPlayerId;
	if (gameState.players[localId]) {
		if (dx !== 0 || dy !== 0) {
			gameState.players[localId].x += dx;
			gameState.players[localId].y += dy;
			// Limiter aux bords du canvas
			const r = gameState.players[localId].radius || 15;
			gameState.players[localId].x = Math.max(r, Math.min(1400 - r, gameState.players[localId].x));
			gameState.players[localId].y = Math.max(r, Math.min(1000 - r, gameState.players[localId].y));
			gameState.players[localId].moving = true;
		} else {
			gameState.players[localId].moving = false;
		}
	}
	socket.emit('playerMove', { dx, dy });
}

// Boucle principale du jeu
function gameLoop() {
	if (!gameState.gameActive) return;

	// Déplacement continu du joueur (tant qu'une touche est maintenue)
	handlePlayerInput();

	// --- CAMERA SUIVIE ---
	// On centre la caméra sur le joueur local, avec un "lead" de 10m (10*player.radius) devant lui
	const localId = gameState.localPlayerId;
	const player = gameState.players[localId];
	let camX = 0, camY = 0;
	if (player) {
		// Calcul du "lead" (avance) devant le joueur
		const leadDist = (player.radius || 15) * 10;
		const angle = typeof player.angle === 'number' ? player.angle : 0;
		camX = player.x + Math.cos(angle) * leadDist - canvas.width / 2;
		camY = player.y + Math.sin(angle) * leadDist - canvas.height / 2;
		// Empêcher la caméra de sortir de la zone de jeu
		camX = Math.max(0, Math.min(1400 - canvas.width, camX));
		camY = Math.max(0, Math.min(1000 - canvas.height, camY));
	}

	ctx.setTransform(1, 0, 0, 1, -camX, -camY); // translation caméra
	ctx.clearRect(camX, camY, canvas.width, canvas.height);

	// Fond étoilé animé
	drawStars();

	// Dessiner les ennemis
	for (const enemy of gameState.enemies) {
		drawEnemy(enemy);
	}

	// Animation fluide des joueurs
	for (const id in gameState.players) {
		const p = gameState.players[id];
		if (!p.alive) continue;
		// Interpolation linéaire (lerp)
		const alpha = 0.2; // plus petit = plus doux
		if (typeof p.displayX === 'number' && typeof p.displayY === 'number') {
			p.displayX += (p.x - p.displayX) * alpha;
			p.displayY += (p.y - p.displayY) * alpha;
		} else {
			p.displayX = p.x;
			p.displayY = p.y;
		}
		drawPlayer(p, true);
	}

	// Dessiner les projectiles
	if (gameState.projectiles) {
		for (const proj of gameState.projectiles) {
			drawProjectile(proj);
		}
	}

	// Dessiner les explosions
	for (let i = explosions.length - 1; i >= 0; i--) {
		if (drawExplosion(explosions[i])) {
			explosions.splice(i, 1);
		}
	}
	// Remettre la caméra à l'origine pour d'autres UI éventuelles
	ctx.setTransform(1, 0, 0, 1, 0, 0);
// Dessin d'un projectile
function drawProjectile(proj) {
	ctx.save();
	ctx.translate(proj.x, proj.y);
	ctx.rotate(proj.angle);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(18, 0);
	ctx.strokeStyle = '#ffeb3b';
	ctx.lineWidth = 4;
	ctx.shadowColor = '#fff';
	ctx.shadowBlur = 10;
	ctx.stroke();
	ctx.restore();
}

// Animation d'explosion (retourne true si terminée)
function drawExplosion(expl) {
	const t = (Date.now() - expl.start) / 400;
	if (t > 1) return true;
	ctx.save();
	ctx.globalAlpha = 1 - t;
	ctx.beginPath();
	ctx.arc(expl.x, expl.y, 30 + 40 * t, 0, 2 * Math.PI);
	ctx.fillStyle = 'orange';
	ctx.shadowColor = 'yellow';
	ctx.shadowBlur = 30;
	ctx.fill();
	ctx.beginPath();
	ctx.arc(expl.x, expl.y, 10 + 20 * t, 0, 2 * Math.PI);
	ctx.fillStyle = 'yellow';
	ctx.globalAlpha = 0.7 - t*0.7;
	ctx.fill();
	ctx.restore();
	return false;
}

// Réception des projectiles et explosions
socket.on('projectilesUpdate', (data) => {
	gameState.projectiles = data.projectiles;
});
socket.on('explosion', (data) => {
	explosions.push({ x: data.x, y: data.y, start: Date.now() });
});

	requestAnimationFrame(gameLoop);
}

// Fonction temporaire pour dessiner des éléments de démonstration
function drawPlaceholder() {
// (supprimé, plus utilisé)
}

// Gestionnaires Socket.IO
socket.on("connect", () => {
	console.log("Connecté au serveur");
});

socket.on("disconnect", () => {
	console.log("Déconnecté du serveur");
});

// TODO: Les étudiants devront implémenter les gestionnaires suivants :

socket.on("playerJoined", (data) => {
	// Mise à jour de la liste des joueurs
	console.log("Nouveau joueur:", data);
});

socket.on("playerLeft", (data) => {
	// Suppression d'un joueur
	console.log("Joueur parti:", data);
});

socket.on("gameStateUpdate", (data) => {
	// Mise à jour de l'état du jeu
	//console.log("Mise à jour du jeu:", data);
	if (data.players) {
		// Interpolation : garder displayX/displayY pour chaque joueur
		for (const id in data.players) {
			const srv = data.players[id];
			if (!gameState.players[id]) {
				// Première apparition : displayX = x
				srv.displayX = srv.x;
				srv.displayY = srv.y;
			} else {
				// Garder la dernière position d'affichage
				srv.displayX = gameState.players[id].displayX ?? srv.x;
				srv.displayY = gameState.players[id].displayY ?? srv.y;
			}
		}
		gameState.players = data.players;
	}
	if (data.enemies) gameState.enemies = data.enemies;
	if (typeof data.gameActive !== 'undefined') gameState.gameActive = data.gameActive;
	if (data.gameStartTime) gameState.gameStartTime = data.gameStartTime;
	updateUI();
});

socket.on("gameStarted", (data) => {
	// Démarrage de la partie
	console.log("La partie a commencé!");
	showScreen("gameScreen");
	initializeGame();
	// Affichage de la capacité spéciale (notif)
	if (data?.capacities) {
		const myCap = data.capacities[socket.id];
		const t = translations[lang] || translations.fr;
		let capLabel = '';
		if (myCap === 'attack') capLabel = t.capacity_attack;
		if (myCap === 'shield') capLabel = t.capacity_shield;
		if (myCap === 'dash') capLabel = t.capacity_dash;
		const notif = t.capacity_notif.replace('{cap}', capLabel);
		showCapacityNotif(notif);
	}
});

// Affiche la notif de capacité spéciale en haut de l'écran
function showCapacityNotif(msg) {
	const notif = document.getElementById('capacityNotif');
	if (!notif) return;
	notif.textContent = msg;
	notif.style.display = 'block';
	setTimeout(() => {
		notif.style.display = 'none';
	}, 3500);
}

socket.on("gameEnded", (data) => {
	// Fin de partie
	console.log("Fin de partie:", data);
	gameState.gameActive = false;
	gameResultH2.textContent = data.winner
		? `${data.winner} a gagné!`
		: "Partie terminée";
	// Retour automatique à l'accueil après 3s, pseudo conservé
	setTimeout(() => {
		showScreen("loginScreen");
		// Le champ pseudo garde la valeur précédente
	}, 3000);
	showScreen("gameOverScreen");
});

socket.on("playerDied", (data) => {
	// Mort d'un joueur
	console.log("Joueur mort:", data);
	if (data.id === socket.id) {
		// Afficher le popup de mort stylisé
		document.getElementById("deathPopup").classList.remove("hidden");
		// (Ré)attacher le bouton spectateur à chaque mort
		const spectateBtn = document.getElementById("deathSpectateButton");
		if (spectateBtn) {
			spectateBtn.onclick = () => {
				document.getElementById("deathPopup").classList.add("hidden");
				showScreen("gameScreen");
				// On ne fait rien, on reste en mode spectateur (gameState.gameActive = false pour ce joueur)
			};
		}
	}
});

// Gestion du bouton rejouer du popup de mort
document.addEventListener("DOMContentLoaded", () => {
	const btn = document.getElementById("deathPlayAgainButton");
	if (btn) {
		btn.onclick = () => {
			document.getElementById("deathPopup").classList.add("hidden");
			showScreen("loginScreen");
		};
	}
});

// Fonctions utilitaires que les étudiants pourront utiliser

function drawPlayer(player) {
	// Bouclier stylisé 360° si actif (placé au bon endroit)
	// Bouclier stylisé 360° si actif (placé au bon endroit)
	// Bouclier stylisé 360° si actif (placé au bon endroit)
	const radius = player.radius || 15;
	const px = typeof player.displayX === 'number' ? player.displayX : player.x;
	const py = typeof player.displayY === 'number' ? player.displayY : player.y;
	const angle = (typeof player.angle === 'number' ? player.angle : 0) + Math.PI/2; // Correction orientation

	if (player.shieldActive) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(px, py, radius + 16 + Math.sin(Date.now()/120)*2, 0, 2 * Math.PI);
		ctx.shadowColor = '#00bfff';
		ctx.shadowBlur = 32;
		ctx.globalAlpha = 0.45 + 0.15 * Math.sin(Date.now()/180);
		ctx.strokeStyle = 'rgba(0,180,255,0.7)';
		ctx.lineWidth = 8;
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
		ctx.restore();
	}

	ctx.save();
	ctx.translate(px, py);
	ctx.rotate(angle);

	// Turbo plus fluide : animé même si on relâche très brièvement la touche
	if (!player._turboAnim) player._turboAnim = { t: 0 };
	if (player.moving) player._turboAnim.t = 8;
	if (player._turboAnim.t > 0) player._turboAnim.t--;
	const turbo = player.moving || player._turboAnim.t > 0;

	if (turbo) {
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(0, radius * 0.9);
		ctx.lineTo(-radius * 0.25, radius * 1.7 + Math.random() * 6);
		ctx.lineTo(radius * 0.25, radius * 1.7 + Math.random() * 6);
		ctx.closePath();
		const grad = ctx.createLinearGradient(0, radius, 0, radius * 2);
		grad.addColorStop(0, '#fff');
		grad.addColorStop(0.3, '#ffe066');
		grad.addColorStop(1, '#ff3c00');
		ctx.fillStyle = grad;
		ctx.globalAlpha = 0.7 + 0.3 * Math.random();
		ctx.shadowColor = '#ff9800';
		ctx.shadowBlur = 16;
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
		ctx.restore();
	}
	// Ombre
	ctx.shadowColor = '#00eaff';
	ctx.shadowBlur = 16;
	// Corps du vaisseau
	ctx.beginPath();
	ctx.moveTo(0, -radius);
	ctx.lineTo(radius * 0.7, radius * 0.8);
	ctx.lineTo(-radius * 0.7, radius * 0.8);
	ctx.closePath();
	ctx.fillStyle = player.color || '#00eaff';
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.lineWidth = 2;
	ctx.strokeStyle = '#fff';
	ctx.stroke();
	// Verrière
	ctx.beginPath();
	ctx.arc(0, -radius * 0.4, radius * 0.25, 0, 2 * Math.PI);
	ctx.fillStyle = '#fff';
	ctx.globalAlpha = 0.7;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.restore();

	// Nom du joueur
	ctx.save();
	ctx.font = "bold 15px 'Segoe UI', Arial";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.fillStyle = "#fff";
	ctx.strokeStyle = "#222";
	ctx.lineWidth = 2;
	ctx.strokeText(player.name, px, py - radius - 8);
	ctx.fillText(player.name, px, py - radius - 8);
	ctx.restore();
}

function drawEnemy(enemy) {
	// Météorite stylisée
	const radius = enemy.radius || 10;
	ctx.save();
	ctx.translate(enemy.x, enemy.y);
	// Ombre
	ctx.shadowColor = '#888';
	ctx.shadowBlur = 12;
	// Corps de la météorite
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const angle = (i / 8) * 2 * Math.PI;
		const r = radius * (0.85 + 0.25 * Math.random());
		ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
	}
	ctx.closePath();
	ctx.fillStyle = '#888';
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.lineWidth = 2;
	ctx.strokeStyle = '#555';
	ctx.stroke();
	// Cratères
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.arc((Math.random() - 0.5) * radius, (Math.random() - 0.5) * radius, radius * 0.2, 0, 2 * Math.PI);
		ctx.fillStyle = '#aaa';
		ctx.fill();
	}
	ctx.restore();
}

function checkCollision(obj1, obj2) {
	// TODO: Les étudiants devront implémenter la détection de collision
	const dx = obj1.x - obj2.x;
	const dy = obj1.y - obj2.y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	return distance < obj1.radius + obj2.radius;
}

function updateUI() {
	// TODO: Les étudiants devront implémenter la mise à jour de l'interface
	playerCountSpan.textContent = Object.keys(gameState.players).length;
	playersAliveSpan.textContent = Object.values(gameState.players).filter((p) => p.alive).length;
	enemyCountSpan.textContent = gameState.enemies.length;

	// Affichage du temps écoulé
	if (gameState.gameActive && gameState.gameStartTime) {
		const now = Date.now();
		const elapsed = Math.floor((now - gameState.gameStartTime) / 1000);
		gameTimeSpan.textContent = elapsed;
	} else {
		gameTimeSpan.textContent = 0;
	}
}

// Génération et animation du fond étoilé
const STAR_COUNT = 80;
let stars = [];
function initStars() {
	stars = [];
	for (let i = 0; i < STAR_COUNT; i++) {
		stars.push({
			x: Math.random() * canvas.width,
			y: Math.random() * canvas.height,
			size: Math.random() * 1.5 + 0.5,
			vx: (Math.random() - 0.5) * 0.2,
			vy: (Math.random() - 0.5) * 0.2,
			alpha: Math.random() * 0.5 + 0.5
		});
	}
}
initStars();
window.addEventListener('resize', initStars);

function drawStars() {
	ctx.save();
	ctx.globalAlpha = 0.7;
	for (const s of stars) {
		ctx.beginPath();
		ctx.arc(s.x, s.y, s.size, 0, 2 * Math.PI);
		ctx.fillStyle = '#fff';
		ctx.fill();
		// Mouvement
		s.x += s.vx;
		s.y += s.vy;
		if (s.x < 0) s.x = canvas.width;
		if (s.x > canvas.width) s.x = 0;
		if (s.y < 0) s.y = canvas.height;
		if (s.y > canvas.height) s.y = 0;
	}
	ctx.globalAlpha = 1;
	ctx.restore();
}
		if (s.y < 0) s.y = canvas.height;
		if (s.y > canvas.height) s.y = 0;
