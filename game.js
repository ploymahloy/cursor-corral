// --- Constants ---
const RANCHER_SPEED_PX_PER_SECOND = 100;
const COW_SPEED_PX_PER_SECOND = 5;
const COWS_COUNT = 15;
const CORRAL_HEIGHT_RATIO = 0.2;
const LASSO_CURSOR = "url('assets/png/lasso.png') 16 16, pointer";
const LASSO_THROW_MS = 280;
const LASSO_RETRACT_MS = 320;
const LASSO_RETRACT_WITH_COW_MS = LASSO_RETRACT_MS * 1.7;
const STEP_INTERVAL_MS = 500;

const LASSO_PHASE = {
	IDLE: 'idle',
	EXTENDING: 'extending',
	RETRACTING: 'retracting'
};

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd']);

// --- Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Assets ---
const rancher = new Image();
rancher.src = 'assets/png/rancher.png';

const cowImage = new Image();
cowImage.src = 'assets/png/cow.png';

const fenceImage = new Image();
fenceImage.src = 'assets/png/fence.png';

const lassoThrowSound = new Audio('assets/mp3/lasso_throw.mp3');
lassoThrowSound.preload = 'auto';

const cowMooSoundSrcs = ['moo_bass', 'moo_alto', 'moo_tenor', 'moo_soprano'].map(
	(name) => `assets/mp3/${name}.mp3`
);
for (const src of cowMooSoundSrcs) {
	const audio = new Audio(src);
	audio.preload = 'auto';
}

const stepSound = new Audio('assets/mp3/step.mp3');
stepSound.preload = 'auto';

const backgroundMusic = new Audio('assets/mp3/loop.mp3');
backgroundMusic.preload = 'auto';
backgroundMusic.loop = true;

// --- State ---
let gameStarted = false;
let gameWon = false;
const heldKeys = new Set();

let rancherX = 0;
let rancherY = 0;
let rancherPositionInitialized = false;
let previousFrameTimeMs = performance.now();
let stepElapsedMs = STEP_INTERVAL_MS;
const cows = [];

const lasso = {
	phase: LASSO_PHASE.IDLE,
	targetX: 0,
	targetY: 0,
	elapsedMs: 0,
	capturedCow: null
};

canvas.style.cursor = LASSO_CURSOR;

function getRandomInt(min, max) {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return min + (buf[0] % (max - min));
}

// --- Audio ---
function playSound(audio) {
	audio.currentTime = 0;
	audio.play().catch(() => {});
}

function startBackgroundMusic() {
	backgroundMusic.play().catch(() => {});
}

function playCowMooStressed() {
	const audio = new Audio(cowMooSoundSrcs[getRandomInt(0, cowMooSoundSrcs.length)]);
	audio.play().catch(() => {});
}

function updateStepSounds(elapsedSeconds, isMoving) {
	if (!isMoving) {
		stepElapsedMs = STEP_INTERVAL_MS;
		return;
	}

	stepElapsedMs += elapsedSeconds * 1000;
	while (stepElapsedMs >= STEP_INTERVAL_MS) {
		playSound(stepSound);
		stepElapsedMs -= STEP_INTERVAL_MS;
	}
}

// --- Layout ---
function getFenceHeight() {
	return fenceImage.height || 32;
}

function getFenceTopY() {
	return canvas.height * (1 - CORRAL_HEIGHT_RATIO);
}

function getCorralTopY() {
	return getFenceTopY() + getFenceHeight();
}

function getViewportSize() {
	const vv = window.visualViewport;
	return {
		width: Math.round(vv?.width ?? window.innerWidth),
		height: Math.round(vv?.height ?? window.innerHeight)
	};
}

function resizeCanvas() {
	const { width, height } = getViewportSize();
	canvas.width = width;
	canvas.height = height;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	clampCowsToZones();
}

// --- Cow model ---
function randomUnitDirection() {
	const angleRadians = Math.random() * Math.PI * 2;
	return {
		directionX: Math.cos(angleRadians),
		directionY: Math.sin(angleRadians)
	};
}

function getCowDimensions() {
	return {
		cowWidth: cowImage.width || 48,
		cowHeight: cowImage.height || 48
	};
}

function createCow() {
	const cowWidth = cowImage.width || 48;
	const cowHeight = cowImage.height || 48;
	const maxX = Math.max(0, canvas.width - cowWidth);
	const maxY = Math.max(0, getCorralTopY() - cowHeight);
	const { directionX, directionY } = randomUnitDirection();
	return {
		x: Math.random() * maxX,
		y: Math.random() * maxY,
		directionX,
		directionY,
		captured: false
	};
}

function seedInitialCows() {
	while (cows.length < COWS_COUNT) {
		cows.push(createCow());
	}
}

function allCowsCaptured() {
	return cows.length >= COWS_COUNT && cows.every(cow => cow.captured);
}

function releaseCowToCorral(cow) {
	const { cowWidth, cowHeight } = getCowDimensions();
	const corralTopY = getCorralTopY();
	const maxX = Math.max(0, canvas.width - cowWidth);
	const maxY = Math.max(0, canvas.height - corralTopY - cowHeight);
	cow.captured = true;
	cow.x = Math.random() * maxX;
	cow.y = corralTopY + Math.random() * maxY;
}

function isPointInCow(x, y, cow) {
	const { cowWidth, cowHeight } = getCowDimensions();
	return x >= cow.x && x <= cow.x + cowWidth && y >= cow.y && y <= cow.y + cowHeight;
}

function findCowAtPoint(x, y) {
	for (let i = cows.length - 1; i >= 0; i--) {
		if (cows[i].captured) {
			continue;
		}
		if (isPointInCow(x, y, cows[i])) {
			return cows[i];
		}
	}
	return null;
}

// Slab method for segment–rectangle hit.
function intersectSlab(origin, delta, minBound, maxBound, tMin, tMax) {
	if (delta === 0) {
		if (origin < minBound || origin > maxBound) {
			return null;
		}
		return { tMin, tMax };
	}

	let tEnter = (minBound - origin) / delta;
	let tExit = (maxBound - origin) / delta;
	if (tEnter > tExit) {
		const swap = tEnter;
		tEnter = tExit;
		tExit = swap;
	}

	tMin = Math.max(tMin, tEnter);
	tMax = Math.min(tMax, tExit);
	if (tMin > tMax) {
		return null;
	}

	return { tMin, tMax };
}

function segmentCowHitT(originX, originY, targetX, targetY, cow, maxT) {
	const { cowWidth, cowHeight } = getCowDimensions();
	const left = cow.x;
	const top = cow.y;
	const right = cow.x + cowWidth;
	const bottom = cow.y + cowHeight;

	const dx = targetX - originX;
	const dy = targetY - originY;
	let tMin = 0;
	let tMax = maxT;

	let slab = intersectSlab(originX, dx, left, right, tMin, tMax);
	if (!slab) {
		return null;
	}
	tMin = slab.tMin;
	tMax = slab.tMax;

	slab = intersectSlab(originY, dy, top, bottom, tMin, tMax);
	if (!slab) {
		return null;
	}
	tMin = slab.tMin;

	return tMin >= 0 && tMin <= maxT ? tMin : null;
}

function findFirstCowAlongPath(originX, originY, targetX, targetY, maxT) {
	let bestCow = null;
	let bestT = Infinity;

	for (const cow of cows) {
		if (cow.captured) {
			continue;
		}
		const t = segmentCowHitT(originX, originY, targetX, targetY, cow, maxT);
		if (t !== null && t < bestT) {
			bestT = t;
			bestCow = cow;
		}
	}

	if (!bestCow) {
		return null;
	}

	return { cow: bestCow, t: bestT };
}

// --- Cow simulation ---
function getCowBounds(cow) {
	const { cowWidth, cowHeight } = getCowDimensions();
	const corralTopY = getCorralTopY();
	const xMax = canvas.width - cowWidth;

	if (cow.captured) {
		return { xMin: 0, xMax, yMin: corralTopY, yMax: canvas.height - cowHeight };
	}

	return { xMin: 0, xMax, yMin: 0, yMax: corralTopY - cowHeight };
}

function clampCowToBounds(cow) {
	const bounds = getCowBounds(cow);

	if (cow.x < bounds.xMin) {
		cow.x = bounds.xMin;
	} else if (cow.x > bounds.xMax) {
		cow.x = bounds.xMax;
	}

	if (cow.y < bounds.yMin) {
		cow.y = bounds.yMin;
	} else if (cow.y > bounds.yMax) {
		cow.y = bounds.yMax;
	}
}

function clampCowsToZones() {
	for (const cow of cows) {
		clampCowToBounds(cow);
	}
}

function bounceCowOffBounds(cow, elapsedSeconds) {
	const cowWidth = cowImage.width;
	const cowHeight = cowImage.height;
	const corralTopY = getCorralTopY();

	cow.x += cow.directionX * COW_SPEED_PX_PER_SECOND * elapsedSeconds;
	cow.y += cow.directionY * COW_SPEED_PX_PER_SECOND * elapsedSeconds;

	if (cow.x <= 0) {
		cow.x = 0;
		cow.directionX = Math.abs(cow.directionX);
	} else if (cow.x >= canvas.width - cowWidth) {
		cow.x = canvas.width - cowWidth;
		cow.directionX = -Math.abs(cow.directionX);
	}

	if (cow.captured) {
		if (cow.y <= corralTopY) {
			cow.y = corralTopY;
			cow.directionY = Math.abs(cow.directionY);
		} else if (cow.y >= canvas.height - cowHeight) {
			cow.y = canvas.height - cowHeight;
			cow.directionY = -Math.abs(cow.directionY);
		}
	} else {
		if (cow.y <= 0) {
			cow.y = 0;
			cow.directionY = Math.abs(cow.directionY);
		} else if (cow.y >= corralTopY - cowHeight) {
			cow.y = corralTopY - cowHeight;
			cow.directionY = -Math.abs(cow.directionY);
		}
	}
}

function updateCows(elapsedSeconds) {
	for (const cow of cows) {
		if (cow === lasso.capturedCow) {
			continue;
		}
		bounceCowOffBounds(cow, elapsedSeconds);
	}
}

// --- Lasso ---
function getLassoRetractMs() {
	return lasso.capturedCow ? LASSO_RETRACT_WITH_COW_MS : LASSO_RETRACT_MS;
}

function captureCow(cow) {
	lasso.capturedCow = cow;
	playCowMooStressed();
}

function getLassoAnimationT() {
	if (lasso.phase === LASSO_PHASE.EXTENDING) {
		return Math.min(1, lasso.elapsedMs / LASSO_THROW_MS);
	}
	if (lasso.phase === LASSO_PHASE.RETRACTING) {
		return 1 - Math.min(1, lasso.elapsedMs / getLassoRetractMs());
	}
	return 0;
}

function stopLassoOnCowHit(originX, originY, hit) {
	lasso.targetX = originX + (lasso.targetX - originX) * hit.t;
	lasso.targetY = originY + (lasso.targetY - originY) * hit.t;
	captureCow(hit.cow);
	lasso.phase = LASSO_PHASE.RETRACTING;
	lasso.elapsedMs = 0;
}

function getRancherOrigin() {
	const width = rancher.width || 48;
	const height = rancher.height || 48;
	return {
		originX: rancherX + width / 2,
		originY: rancherY + height / 2
	};
}

function getLassoEndPoint() {
	const { originX, originY } = getRancherOrigin();
	if (lasso.phase === LASSO_PHASE.IDLE) {
		return { originX, originY, endX: originX, endY: originY };
	}

	const t = getLassoAnimationT();

	return {
		originX,
		originY,
		endX: originX + (lasso.targetX - originX) * t,
		endY: originY + (lasso.targetY - originY) * t
	};
}

function updateLasso(elapsedSeconds) {
	if (lasso.phase === LASSO_PHASE.IDLE) {
		return;
	}

	lasso.elapsedMs += elapsedSeconds * 1000;

	if (lasso.phase === LASSO_PHASE.EXTENDING) {
		const { originX, originY } = getRancherOrigin();
		const extendT = getLassoAnimationT();
		const pathHit = findFirstCowAlongPath(originX, originY, lasso.targetX, lasso.targetY, extendT);

		if (pathHit) {
			stopLassoOnCowHit(originX, originY, pathHit);
			return;
		}

		if (lasso.elapsedMs >= LASSO_THROW_MS) {
			if (!lasso.capturedCow) {
				const endpointCow = findCowAtPoint(lasso.targetX, lasso.targetY);
				if (endpointCow) {
					captureCow(endpointCow);
				}
			}
			lasso.phase = LASSO_PHASE.RETRACTING;
			lasso.elapsedMs = 0;
		}
		return;
	}

	if (lasso.elapsedMs >= getLassoRetractMs()) {
		if (lasso.capturedCow) {
			releaseCowToCorral(lasso.capturedCow);
			if (!gameWon && allCowsCaptured()) {
				showWinOverlay();
			}
			lasso.capturedCow = null;
		}
		lasso.phase = LASSO_PHASE.IDLE;
		lasso.elapsedMs = 0;
		canvas.style.cursor = LASSO_CURSOR;
	}
}

function updateCapturedCow() {
	if (lasso.phase !== LASSO_PHASE.RETRACTING || !lasso.capturedCow) {
		return;
	}

	const { endX, endY } = getLassoEndPoint();
	const { cowWidth, cowHeight } = getCowDimensions();
	lasso.capturedCow.x = endX - cowWidth / 2;
	lasso.capturedCow.y = endY - cowHeight / 2;
}

function startLassoThrow(targetX, targetY) {
	if (gameWon || lasso.phase !== LASSO_PHASE.IDLE) {
		return;
	}

	lasso.phase = LASSO_PHASE.EXTENDING;
	lasso.targetX = targetX;
	lasso.targetY = targetY;
	lasso.elapsedMs = 0;
	lasso.capturedCow = null;
	canvas.style.cursor = 'none';

	playSound(lassoThrowSound);
}

// --- Render ---
function drawCows() {
	if (!cowImage.complete) {
		return;
	}
	for (const cow of cows) {
		if (cow.captured) {
			continue;
		}
		ctx.drawImage(cowImage, cow.x, cow.y);
	}
	for (const cow of cows) {
		if (!cow.captured) {
			continue;
		}
		ctx.drawImage(cowImage, cow.x, cow.y);
	}
}

function drawFence() {
	if (!fenceImage.complete) {
		return;
	}
	const fenceY = getFenceTopY();
	const fenceWidth = fenceImage.width;
	for (let x = 0; x < canvas.width; x += fenceWidth) {
		ctx.drawImage(fenceImage, x, fenceY);
	}
}

function centerRancher() {
	rancherX = canvas.width / 2 - rancher.width / 2;
	rancherY = canvas.height / 2 - rancher.height / 2;
}

function drawLasso() {
	if (lasso.phase === LASSO_PHASE.IDLE) {
		return;
	}

	const { originX, originY, endX, endY } = getLassoEndPoint();
	ctx.beginPath();
	ctx.moveTo(originX, originY);
	ctx.lineTo(endX, endY);
	ctx.strokeStyle = '#5b420b';
	ctx.lineWidth = 3;
	ctx.lineCap = 'round';
	ctx.stroke();
}

// --- Input ---
function getMovementDirection() {
	let dx = 0;
	let dy = 0;
	if (heldKeys.has('w')) dy -= 1;
	if (heldKeys.has('s')) dy += 1;
	if (heldKeys.has('a')) dx -= 1;
	if (heldKeys.has('d')) dx += 1;
	return { dx, dy };
}

// --- Win / reset ---
function showWinOverlay() {
	gameWon = true;
	winOverlay.classList.remove('hidden');
	playAgainButton.focus();
}

function resetGame() {
	gameWon = false;
	winOverlay.classList.add('hidden');
	lasso.phase = LASSO_PHASE.IDLE;
	lasso.capturedCow = null;
	lasso.elapsedMs = 0;
	canvas.style.cursor = LASSO_CURSOR;
	cows.length = 0;
	seedInitialCows();
	heldKeys.clear();
	centerRancher();
}

// --- Game loop ---
function gameLoop(frameTimeMs) {
	const elapsedSeconds = (frameTimeMs - previousFrameTimeMs) / 1000;
	previousFrameTimeMs = frameTimeMs;

	if (gameWon) {
		requestAnimationFrame(gameLoop);
		return;
	}

	if (lasso.phase === LASSO_PHASE.IDLE) {
		const { dx, dy } = getMovementDirection();
		const isMoving = dx !== 0 || dy !== 0;
		updateStepSounds(elapsedSeconds, isMoving);
		if (isMoving) {
			const directionLength = Math.hypot(dx, dy);
			rancherX += (dx / directionLength) * RANCHER_SPEED_PX_PER_SECOND * elapsedSeconds;
			rancherY += (dy / directionLength) * RANCHER_SPEED_PX_PER_SECOND * elapsedSeconds;
		}
	} else {
		updateStepSounds(elapsedSeconds, false);
	}

	updateLasso(elapsedSeconds);
	updateCapturedCow();
	updateCows(elapsedSeconds);

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawCows();
	drawFence();
	if (rancher.complete) {
		ctx.drawImage(rancher, rancherX, rancherY);
	}
	drawLasso();

	requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', resizeCanvas);
window.visualViewport?.addEventListener('resize', resizeCanvas);
window.visualViewport?.addEventListener('scroll', resizeCanvas);
resizeCanvas();

canvas.addEventListener('click', event => {
	if (!gameStarted || gameWon) {
		return;
	}
	startLassoThrow(event.offsetX, event.offsetY);
});

window.addEventListener('keydown', event => {
	if (!gameStarted || gameWon) {
		return;
	}
	const key = event.key.toLowerCase();
	if (MOVEMENT_KEYS.has(key)) {
		heldKeys.add(key);
	}
});

window.addEventListener('keyup', event => {
	heldKeys.delete(event.key.toLowerCase());
});

window.addEventListener('blur', () => {
	heldKeys.clear();
});

rancher.onload = () => {
	if (!rancherPositionInitialized) {
		centerRancher();
		rancherPositionInitialized = true;
	}
};

if (rancher.complete) {
	centerRancher();
	rancherPositionInitialized = true;
}

cowImage.onload = () => {
	seedInitialCows();
};

if (cowImage.complete) {
	seedInitialCows();
}

const startOverlay = document.getElementById('start-overlay');
const playButton = document.getElementById('play-button');
const winOverlay = document.getElementById('win-overlay');
const playAgainButton = document.getElementById('play-again-button');

playButton.addEventListener('click', () => {
	startOverlay.classList.add('hidden');
	gameStarted = true;
	startBackgroundMusic();
	requestAnimationFrame(gameLoop);
});

playAgainButton.addEventListener('click', () => {
	resetGame();
});
