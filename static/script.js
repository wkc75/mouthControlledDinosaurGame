const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreText = document.getElementById("scoreText");
const messageText = document.getElementById("messageText");
const restartButton = document.getElementById("restartButton");
const webcam = document.getElementById("webcam");
const aiText = document.getElementById("aiText");
const confidenceText = document.getElementById("confidenceText");
const TM_CONFIG = window.TM_CONFIG ?? {};

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const GROUND_HEIGHT = 54;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;
const GRAVITY = 0.7;
const JUMP_STRENGTH = -14;
const START_SPEED = 6;
const ACTION_COOLDOWN = 550;
const PREDICTION_INTERVAL = toFiniteNumber(TM_CONFIG.predictionIntervalMs, 150);
const TM_MODEL_BASE_PATH = normalizeModelBasePath(
  String(TM_CONFIG.modelBasePath ?? "/static/tm-model/")
);
const TM_OPEN_LABEL = String(TM_CONFIG.openLabel ?? "mouth_open")
  .trim()
  .toLowerCase();
const TM_OPEN_THRESHOLD = toFiniteNumber(TM_CONFIG.openThreshold, 0.85);

const player = {
  x: 90,
  width: 42,
  height: 42,
  baseY: GROUND_Y - 42,
  y: GROUND_Y - 42,
  velocityY: 0,
  isOnGround: true
};

let obstacles = [];
let score = 0;
let gameSpeed = START_SPEED;
let obstacleTimer = 0;
let obstacleInterval = 90;
let groundOffset = 0;
let animationId = null;
let predictionLoopId = null;
let gameState = "ready";
let previousMouthOpen = false;
let lastAiActionTime = 0;
let isPredicting = false;
let tmModel = null;
let cameraReady = false;

function normalizeModelBasePath(basePath) {
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resetPlayer() {
  player.baseY = GROUND_Y - player.height;
  player.y = player.baseY;
  player.velocityY = 0;
  player.isOnGround = true;
}

function resetGame() {
  obstacles = [];
  score = 0;
  gameSpeed = START_SPEED;
  obstacleTimer = 0;
  obstacleInterval = 90;
  groundOffset = 0;
  gameState = "ready";
  previousMouthOpen = false;
  lastAiActionTime = 0;
  resetPlayer();
  updateHud();
}

function startGame() {
  if (gameState === "running") {
    return;
  }

  if (gameState === "gameover") {
    obstacles = [];
    score = 0;
    gameSpeed = START_SPEED;
    obstacleTimer = 0;
    groundOffset = 0;
    resetPlayer();
  }

  gameState = "running";
  updateHud();
}

function jump() {
  if (gameState !== "running" || !player.isOnGround) {
    return;
  }

  player.velocityY = JUMP_STRENGTH;
  player.isOnGround = false;
}

function triggerGameAction() {
  if (gameState === "gameover") {
    return;
  }

  if (gameState === "ready") {
    startGame();
    return;
  }

  jump();
}

function spawnObstacle() {
  const height = 26 + Math.random() * 28;
  const width = 18 + Math.random() * 18;

  obstacles.push({
    x: GAME_WIDTH + 20,
    y: GROUND_Y - height,
    width,
    height,
    scored: false
  });

  obstacleInterval = 70 + Math.floor(Math.random() * 45);
}

function updatePlayer() {
  if (gameState !== "running") {
    player.y = player.baseY;
    return;
  }

  player.velocityY += GRAVITY;
  player.y += player.velocityY;

  if (player.y >= player.baseY) {
    player.y = player.baseY;
    player.velocityY = 0;
    player.isOnGround = true;
  }
}

function updateObstacles() {
  obstacleTimer += 1;

  if (obstacleTimer >= obstacleInterval) {
    spawnObstacle();
    obstacleTimer = 0;
  }

  obstacles.forEach((obstacle) => {
    obstacle.x -= gameSpeed;
  });

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);
}

function updateGround() {
  if (gameState !== "running") {
    return;
  }

  groundOffset = (groundOffset + gameSpeed) % 40;
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function checkCollisions() {
  for (const obstacle of obstacles) {
    if (isColliding(player, obstacle)) {
      gameState = "gameover";
      updateHud();
      break;
    }
  }
}

function updateScore() {
  for (const obstacle of obstacles) {
    if (!obstacle.scored && obstacle.x + obstacle.width < player.x) {
      obstacle.scored = true;
      score += 1;
    }
  }

  if (score > 0) {
    gameSpeed = START_SPEED + Math.floor(score / 5) * 0.4;
  }
}

function updateHud() {
  scoreText.textContent = `Score: ${score}`;

  if (gameState === "ready") {
    messageText.textContent = "Allow camera access, then open your mouth to start.";
  } else if (gameState === "running") {
    messageText.textContent = "Open your mouth to jump over the obstacles.";
  } else {
    messageText.textContent = "Game over. Press Restart or Space to try again.";
  }
}

function drawBackground() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#f2d277";
  ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GROUND_HEIGHT);

  ctx.strokeStyle = "#7c6323";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(GAME_WIDTH, GROUND_Y);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fillRect(110, 38, 90, 20);
  ctx.fillRect(520, 54, 110, 18);
  ctx.fillRect(720, 28, 95, 22);

  ctx.fillStyle = "#b39042";
  for (let x = -groundOffset; x < GAME_WIDTH; x += 40) {
    ctx.fillRect(x, GROUND_Y + 22, 20, 4);
  }
}

function drawPlayer() {
  ctx.fillStyle = "#2d6a4f";
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.fillStyle = "#1f513b";
  ctx.fillRect(player.x + 28, player.y + 8, 18, 12);

  ctx.fillStyle = "#fff";
  ctx.fillRect(player.x + 30, player.y + 10, 6, 6);

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(player.x + 33, player.y + 12, 2, 2);
}

function drawObstacles() {
  ctx.fillStyle = "#b14a3b";

  obstacles.forEach((obstacle) => {
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.fillRect(obstacle.x - 4, obstacle.y + 8, 4, 8);
    ctx.fillRect(obstacle.x + obstacle.width, obstacle.y + 14, 4, 8);
  });
}

function drawOverlay() {
  if (gameState === "running") {
    return;
  }

  ctx.fillStyle = "rgba(58, 44, 13, 0.08)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#3b2b0e";
  ctx.textAlign = "center";

  if (gameState === "ready") {
    ctx.font = "bold 28px Trebuchet MS";
    ctx.fillText("Open Your Mouth To Start", GAME_WIDTH / 2, 96);
    ctx.font = "20px Trebuchet MS";
    ctx.fillText("Space also works if you want to test without AI", GAME_WIDTH / 2, 130);
  } else if (gameState === "gameover") {
    ctx.font = "bold 30px Trebuchet MS";
    ctx.fillText("Game Over", GAME_WIDTH / 2, 96);
    ctx.font = "20px Trebuchet MS";
    ctx.fillText("Press Restart or Space to try again", GAME_WIDTH / 2, 130);
  }

  ctx.textAlign = "start";
}

function update() {
  if (gameState === "running") {
    updatePlayer();
    updateObstacles();
    updateGround();
    checkCollisions();

    if (gameState === "running") {
      updateScore();
      updateHud();
    }
  }
}

function draw() {
  drawBackground();
  drawPlayer();
  drawObstacles();
  drawOverlay();
}

function gameLoop() {
  update();
  draw();
  animationId = requestAnimationFrame(gameLoop);
}

function updateAiStatus(label, confidence) {
  aiText.textContent = `AI: ${label}`;
  confidenceText.textContent =
    typeof confidence === "number"
      ? `Confidence: ${Math.round(confidence * 100)}%`
      : "Confidence: -";
}

function handlePrediction(data) {
  const mouthOpen = Boolean(data.mouthOpen);
  const label = data.label || "unknown";
  const confidence = typeof data.confidence === "number" ? data.confidence : 0;

  updateAiStatus(label, confidence);

  // Only react when the mouth changes from closed to open, with a cooldown.
  const now = Date.now();
  const freshOpen = mouthOpen && !previousMouthOpen;
  const cooldownFinished = now - lastAiActionTime > ACTION_COOLDOWN;

  if (freshOpen && cooldownFinished) {
    triggerGameAction();
    lastAiActionTime = now;
  }

  previousMouthOpen = mouthOpen;
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "user" },
      audio: false
    });

    webcam.srcObject = stream;
    cameraReady = true;
    refreshAiReadyState();
    startPredictionLoop();
  } catch (error) {
    aiText.textContent = "AI: Camera access failed";
    confidenceText.textContent = error.message;
    messageText.textContent = "Camera access is required for AI control. Space still works.";
  }
}

function refreshAiReadyState() {
  if (!cameraReady && !tmModel) {
    aiText.textContent = "AI: Waiting for camera and model";
    confidenceText.textContent = "Confidence: -";
    return;
  }

  if (cameraReady && !tmModel) {
    aiText.textContent = "AI: Camera ready";
    confidenceText.textContent = "Confidence: waiting for model";
    return;
  }

  if (!cameraReady && tmModel) {
    aiText.textContent = "AI: Model loaded";
    confidenceText.textContent = "Confidence: waiting for camera";
    return;
  }

  aiText.textContent = "AI: Ready";
  confidenceText.textContent = "Confidence: waiting for prediction";
}

function startPredictionLoop() {
  if (predictionLoopId !== null || !cameraReady || !tmModel) {
    return;
  }

  predictionLoopId = window.setInterval(predictMouth, PREDICTION_INTERVAL);
}

function getTopPrediction(predictions) {
  return predictions.reduce((bestPrediction, currentPrediction) =>
    currentPrediction.probability > bestPrediction.probability
      ? currentPrediction
      : bestPrediction
  );
}

function formatModelLoadError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("404")) {
    return `Model files not found in ${TM_MODEL_BASE_PATH}`;
  }

  if (message.includes("Failed to fetch")) {
    return `Could not load model from ${TM_MODEL_BASE_PATH}`;
  }

  return message;
}

async function loadTeachableMachineModel() {
  if (!window.tmImage) {
    throw new Error("Teachable Machine image library did not load.");
  }

  const modelURL = `${TM_MODEL_BASE_PATH}model.json`;
  const metadataURL = `${TM_MODEL_BASE_PATH}metadata.json`;

  tmModel = await window.tmImage.load(modelURL, metadataURL);

  const classLabels =
    typeof tmModel.getClassLabels === "function"
      ? tmModel.getClassLabels().map((label) => String(label).trim().toLowerCase())
      : [];

  if (!classLabels.includes(TM_OPEN_LABEL)) {
    throw new Error(`Model does not include the "${TM_OPEN_LABEL}" class.`);
  }

  refreshAiReadyState();
  startPredictionLoop();
}

async function predictMouth() {
  if (isPredicting || !tmModel || webcam.readyState < 2) {
    return;
  }

  isPredicting = true;

  try {
    const predictions = await tmModel.predict(webcam, true);

    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error("Model returned no predictions.");
    }

    const topPrediction = getTopPrediction(predictions);

    handlePrediction({
      label: topPrediction.className,
      confidence: topPrediction.probability,
      mouthOpen:
        String(topPrediction.className).trim().toLowerCase() === TM_OPEN_LABEL &&
        topPrediction.probability >= TM_OPEN_THRESHOLD
    });
  } catch (error) {
    aiText.textContent = `AI: ${error.message}`;
    confidenceText.textContent = "Confidence: -";
  } finally {
    isPredicting = false;
  }
}

async function initAi() {
  await startCamera();

  try {
    await loadTeachableMachineModel();
  } catch (error) {
    aiText.textContent = "AI: Add your Teachable Machine export";
    confidenceText.textContent = "Confidence: waiting for model files";
    messageText.textContent = "AI model not added yet. Space still works until you add the export.";
    console.error(formatModelLoadError(error));
  }
}

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") {
    return;
  }

  event.preventDefault();

  if (gameState === "gameover") {
    resetGame();
    return;
  }

  triggerGameAction();
});

restartButton.addEventListener("click", () => {
  resetGame();
});

resetGame();
initAi();

if (animationId === null) {
  gameLoop();
}
