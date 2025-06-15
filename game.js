const playerImg = new Image();
playerImg.src = 'images/player.png';

const enemyImg = new Image();
enemyImg.src = 'images/enemy.png';
enemyImg.onload = () => {
    console.log("enemy.png загружен");
};
enemyImg.onerror = () => {
    console.error("Не удалось загрузить enemy.png");
};

const wallImg = new Image();
wallImg.src = 'images/tile_522.png';
wallImg.onload = () => {
    console.log("Размеры изображения стены:", wallImg.width, wallImg.height);

    for (let obs of obstacles) {
        obs.width = wallImg.width;
        obs.height = wallImg.height;
    }
};

const bulletImg = new Image();
bulletImg.src = 'images/bullet.png'; // Помести bullet.png в папку public/images или wwwroot/images
bulletImg.onload = () => console.log("Пуля загружена");
bulletImg.onerror = () => console.error("Не удалось загрузить bullet.png");

const boxImg = new Image();
boxImg.src = 'images/tile_129.png'; // убедись, что путь к файлу правильный


// Инициализация canvas
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');

// Функция для установки размеров canvas на весь экран
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Установка начальных размеров
resizeCanvas();

// Обработчик изменения размера окна
window.addEventListener('resize', resizeCanvas);

// Добавляем обработчик для полноэкранного режима
document.addEventListener('keydown', (e) => {
    if (e.key === 'f') {
        if (!document.fullscreenElement) {
            canvas.requestFullscreen().catch(err => {
                console.error(`Ошибка при попытке перейти в полноэкранный режим: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }
});

const worldWidth = 2000;
const worldHeight = 2000;

// Генерация препятствий (коробок и стен)
const obstacles = [];
const gridSize = 100;
const centerX = Math.floor(worldWidth / 2 / gridSize) * gridSize;
const centerY = Math.floor(worldHeight / 2 / gridSize) * gridSize;

for (let x = 0; x < worldWidth; x += gridSize) {
    for (let y = 0; y < worldHeight; y += gridSize) {
        // Пропускаем центральную клетку, где появляется игрок
        if (
            x >= centerX - gridSize && x <= centerX + gridSize &&
            y >= centerY - gridSize && y <= centerY + gridSize
        ) continue;
        // Случайно размещаем коробки с вероятностью 1 к 7
        if (Math.random() < 0.14) {
            obstacles.push({ x, y, width: 100, height: 100, type: "box" });
        }
    }
}
// Добавим несколько стен для разнообразия
obstacles.push(
    { x: 150, y: 150, width: 100, height: 50, type: "wall" },
    { x: 1150, y: 1150, width: 100, height: 50, type: "wall" },
    { x: 150, y: 1150, width: 100, height: 50, type: "wall" },
    { x: 1150, y: 150, width: 100, height: 50, type: "wall" }
);

const tileImg = new Image();
tileImg.src = 'images/tile.png';

let floorPattern = null;

tileImg.onload = () => {
    floorPattern = ctx.createPattern(tileImg, 'repeat');
    console.log('Плитка загружена');
};

tileImg.onerror = () => {
    console.error('Не удалось загрузить tile.png');
};

// Игровые переменные
let score = 0;
let lives = 3;
let gameRunning = false;
let animationId;
let cameraOffset = { x: 0, y: 0 };
let lastDirection = { x: 0, y: -1 }; // Направление по умолчанию (вверх)

// Игровые объекты
const player = {
    x: worldWidth / 2 - 25,
    y: worldHeight / 2 - 25,
    width: 50,
    height: 50,
    speed: 5,
    color: '#3498db',
    isMovingLeft: false,
    isMovingRight: false,
    isMovingUp: false,
    isMovingDown: false
};

const bullets = [];
const enemies = [];
const enemySize = 40;
const bulletSpeed = 10;
let enemySpeed = 2;
let enemySpawnRate = 120;
let shootCooldown = 0;
const shootDelay = 15; // Задержка между выстрелами (в кадрах)

// --- Бонусы (таблетки) ---
const bonuses = [];
const BONUS_TYPES = {
    LIFE: 'life',
    SPEED: 'speed'
};
const BONUS_SIZE = 40;
let speedBonusActive = false;
let speedBonusTimer = 0;
const SPEED_BONUS_DURATION = 300; // 5 секунд при 60 FPS
const SPEED_BONUS_MULT = 2;
const MAX_LIVES = 5;

// --- Звук выстрела ---
const shootSound = new Audio('sounds/shoot.mp3');
shootSound.volume = 0.3;
shootSound.onerror = function(e) {
    console.error('Ошибка загрузки звука выстрела:', e);
};

// --- Режимы стрельбы ---
let fireMode = 1; // 1 - одиночный, 2 - очередь, 3 - автомат
let burstCount = 0;
let burstDelay = 0;
window.addEventListener('keydown', (e) => {
    if (e.key === '1') fireMode = 1;
    if (e.key === '2') fireMode = 2;
    if (e.key === '3') fireMode = 3;
});

// Обработчики событий
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') player.isMovingLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd') player.isMovingRight = true;
    if (e.key === 'ArrowUp' || e.key === 'w') player.isMovingUp = true;
    if (e.key === 'ArrowDown' || e.key === 's') player.isMovingDown = true;
    if (e.key === ' ' && gameRunning) {
        if (fireMode === 1) {
            // Одиночный выстрел
            if (shootCooldown <= 0) {
                shoot();
                shootCooldown = shootDelay;
            }
        } else if (fireMode === 2) {
            // Очередь (burst)
            if (shootCooldown <= 0 && burstCount === 0) {
                burstCount = 3; // 3 пули в очереди
                burstDelay = 0;
            }
        }
        // Для автомата обработка в gameLoop
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') player.isMovingLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd') player.isMovingRight = false;
    if (e.key === 'ArrowUp' || e.key === 'w') player.isMovingUp = false;
    if (e.key === 'ArrowDown' || e.key === 's') player.isMovingDown = false;
});

startBtn.addEventListener('click', startGame);

// --- Настройки и пауза ---
let isMuted = false;
let isPaused = false;
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsBackBtn = document.getElementById('settings-back-btn');
const muteSoundCheckbox = document.getElementById('mute-sound-checkbox');
const pauseOverlay = document.getElementById('pause-overlay');

settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    muteSoundCheckbox.checked = isMuted;
});
settingsBackBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});
muteSoundCheckbox.addEventListener('change', () => {
    isMuted = muteSoundCheckbox.checked;
});

// Пауза по клавише P
window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
        if (gameRunning) {
            isPaused = !isPaused;
            pauseOverlay.style.display = isPaused ? 'flex' : 'none';
            if (!isPaused) {
                requestAnimationFrame(gameLoop);
            }
        }
    }
});

// Функции игры
function startGame() {
    if (gameRunning) return;
    console.log('Starting game...');

    // Сброс состояния игры
    score = 0;
    lives = 3;
    bullets.length = 0;
    enemies.length = 0;
    enemySpeed = 2;
    enemySpawnRate = 120;
    player.x = worldWidth / 2 - 25;
    player.y = worldHeight / 2 - 25;
    cameraOffset = { x: 0, y: 0 };
    lastDirection = { x: 0, y: -1 };

    console.log('Game state reset:', { score, lives, playerPosition: { x: player.x, y: player.y } });
    updateScore();
    updateLives();
    startBtn.style.display = 'none';
    gameRunning = true;

    // Запуск игрового цикла
    gameLoop();
}

function gameLoop() {
    if (!gameRunning || isPaused) return;
    console.log('Game loop iteration:', { 
        playerPosition: { x: player.x, y: player.y },
        enemiesCount: enemies.length,
        bulletsCount: bullets.length
    });

    // Обновление кулдауна стрельбы
    if (shootCooldown > 0) {
        shootCooldown--;
    }

   

    if (floorPattern) {
        ctx.fillStyle = floorPattern;
        ctx.save();
        ctx.translate(-cameraOffset.x, -cameraOffset.y);
        ctx.fillRect(0, 0, worldWidth, worldHeight);
        ctx.restore();
    } else {
        ctx.fillStyle = '#111122';
        ctx.fillRect(-cameraOffset.x, -cameraOffset.y, worldWidth, worldHeight);
    }

    for (const obs of obstacles) {
        const img = obs.type === "wall" ? wallImg : boxImg; // выбираем по типу
        ctx.drawImage(
            img,
            obs.x - cameraOffset.x,
            obs.y - cameraOffset.y,
            obs.width,
            obs.height
        );
    }

    // Движение игрока
    const prevX = player.x;
    const prevY = player.y;

    let dx = 0, dy = 0;
    if (player.isMovingLeft && player.x > 0) dx -= player.speed;
    if (player.isMovingRight && player.x < worldWidth - player.width) dx += player.speed;
    if (player.isMovingUp && player.y > 0) dy -= player.speed;
    if (player.isMovingDown && player.y < worldHeight - player.height) dy += player.speed;

    // 1. Пробуем двигаться по обоим осям
    player.x += dx;
    player.y += dy;
    if (!isCollidingWithObstacles(player) && (dx !== 0 || dy !== 0)) {
        // Если движение удалось, обновляем направление
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            lastDirection.x = dx / len;
            lastDirection.y = dy / len;
        }
    } else {
        // 2. Если не получилось, пробуем только по X
        player.x = prevX + dx;
        player.y = prevY;
        if (!isCollidingWithObstacles(player) && dx !== 0) {
            const len = Math.abs(dx);
            lastDirection.x = dx / len;
            lastDirection.y = 0;
        } else {
            // 3. Если не получилось, пробуем только по Y
            player.x = prevX;
            player.y = prevY + dy;
            if (!isCollidingWithObstacles(player) && dy !== 0) {
                const len = Math.abs(dy);
                lastDirection.x = 0;
                lastDirection.y = dy / len;
            } else {
                // 4. Если не получилось, остаёмся на месте
                player.x = prevX;
                player.y = prevY;
            }
        }
    }

    // Обновление позиции камеры
    cameraOffset.x = player.x - canvas.width / 2 + player.width / 2;
    cameraOffset.y = player.y - canvas.height / 2 + player.height / 2;

    // Ограничение камеры границами мира
    cameraOffset.x = Math.max(0, Math.min(cameraOffset.x, worldWidth - canvas.width));
    cameraOffset.y = Math.max(0, Math.min(cameraOffset.y, worldHeight - canvas.height));

    

    // Отрисовка сетки для ориентации
    ctx.strokeStyle = '#333344';
    ctx.lineWidth = 1;
    const gridSize = 100;
    const startX = Math.floor(cameraOffset.x / gridSize) * gridSize;
    const startY = Math.floor(cameraOffset.y / gridSize) * gridSize;

    for (let x = startX; x < startX + canvas.width + gridSize; x += gridSize) {
        if (x >= 0 && x <= worldWidth) {
            ctx.beginPath();
            ctx.moveTo(x - cameraOffset.x, 0);
            ctx.lineTo(x - cameraOffset.x, worldHeight - cameraOffset.y);
            ctx.stroke();
        }
    }

    for (let y = startY; y < startY + canvas.height + gridSize; y += gridSize) {
        if (y >= 0 && y <= worldHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y - cameraOffset.y);
            ctx.lineTo(worldWidth - cameraOffset.x, y - cameraOffset.y);
            ctx.stroke();
        }
    }

    ctx.save();
    ctx.translate(
        player.x - cameraOffset.x + player.width / 2,
        player.y - cameraOffset.y + player.height / 2
    );
    const angle = Math.atan2(lastDirection.y, lastDirection.x);
    ctx.rotate(angle);
    ctx.drawImage(
        playerImg,
        -player.width / 2,
        -player.height / 2,
        player.width,
        player.height
    );
    ctx.restore();


    // Генерация врагов
    if (Math.random() * enemySpawnRate < 1) {
        spawnEnemy();
    }

    // Обновление и отрисовка пуль
    updateBullets();

    // Обновление и отрисовка врагов
    updateEnemies();

    // Отрисовка бонусов
    for (const bonus of bonuses) {
        ctx.save();
        ctx.translate(bonus.x - cameraOffset.x + BONUS_SIZE / 2, bonus.y - cameraOffset.y + BONUS_SIZE / 2);
        if (bonus.type === BONUS_TYPES.LIFE) {
            // Красная таблетка с крестиком
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(0, 0, BONUS_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
        } else if (bonus.type === BONUS_TYPES.SPEED) {
            // Синяя таблетка со стрелкой
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(0, 0, BONUS_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
    }

    // Проверка столкновений
    checkCollisions();

    // Увеличение сложности
    if (score > 0 && score % 10 === 0) {
        enemySpeed = 2 + Math.floor(score / 10) * 0.5;
        enemySpawnRate = Math.max(30, 120 - Math.floor(score / 5));
    }

    // Эффект ускорения
    if (speedBonusActive) {
        speedBonusTimer--;
        if (speedBonusTimer <= 0) {
            speedBonusActive = false;
            player.speed /= SPEED_BONUS_MULT;
        }
    }

    // --- Стрельба автоматом и очередью ---
    if (fireMode === 3 && player.isMovingLeft + player.isMovingRight + player.isMovingUp + player.isMovingDown >= 0) {
        // Автомат: если пробел нажат
        if (document.activeElement !== document.body) document.body.focus();
        if (shootCooldown <= 0 && gameRunning && keyIsDown(' ')) {
            shoot();
            shootCooldown = shootDelay;
        }
    }
    if (fireMode === 2 && burstCount > 0 && shootCooldown <= 0) {
        shoot();
        burstCount--;
        shootCooldown = 5; // Быстрое время между пулями в очереди
    }

    // Продолжение игрового цикла
    animationId = requestAnimationFrame(gameLoop);

    drawMiniMap();
}

function isColliding(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function isCollidingWithObstacles(obj) {
    for (const obs of obstacles) {
        if (
            obj.x < obs.x + obs.width &&
            obj.x + obj.width > obs.x &&
            obj.y < obs.y + obs.height &&
            obj.y + obj.height > obs.y
        ) {
            return true;
        }
    }
    return false;
}

function spawnEnemy() {
    // Спавн врага в случайном месте карты (но не слишком близко к игроку)
    let x, y;
    const minDistance = 300;

    do {
        x = Math.random() * (worldWidth - enemySize);
        y = Math.random() * (worldHeight - enemySize);
    } while (
        Math.abs(x - player.x) < minDistance &&
        Math.abs(y - player.y) < minDistance
    );

    enemies.push({
        x: x,
        y: y,
        width: enemySize,
        height: enemySize,
        speed: enemySpeed,
        color: '#e74c3c',
        dx: 0,
        dy: 0
    });
}

function shoot() {
    const offset = 20;
    const dirX = lastDirection.x;
    const dirY = lastDirection.y;
    const startX = player.x + player.width / 2 + dirX * offset - 2.5;
    const startY = player.y + player.height / 2 + dirY * offset - 7.5;
    bullets.push({
        x: startX,
        y: startY,
        width: 20,
        height: 20,
        speed: bulletSpeed,
        color: '#f1c40f',
        dx: dirX,
        dy: dirY
    });
    if (!isMuted) {
        try {
            shootSound.currentTime = 0;
            shootSound.play().catch(e => {
                console.warn('Не удалось воспроизвести звук выстрела:', e);
            });
        } catch (e) {
            console.warn('Ошибка воспроизведения звука выстрела:', e);
        }
    }
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.dx * bullet.speed;
        bullet.y += bullet.dy * bullet.speed;

        // Проверка столкновений с препятствиями
        let hitObstacle = false;
        for (const obs of obstacles) {
            if (
                bullet.x < obs.x + obs.width &&
                bullet.x + bullet.width > obs.x &&
                bullet.y < obs.y + obs.height &&
                bullet.y + bullet.height > obs.y
            ) {
                hitObstacle = true;
                break;
            }
        }

        if (hitObstacle) {
            bullets.splice(i, 1); // удалить пулю, если она попала в преграду
            continue; // перейти к следующей пуле
        }


        // Отрисовка пули
        ctx.save();
        ctx.translate(
            bullet.x - cameraOffset.x + bullet.width / 2,
            bullet.y - cameraOffset.y + bullet.height / 2
        );
        ctx.rotate(Math.atan2(bullet.dy, bullet.dx) + Math.PI / 2);
        ctx.drawImage(bulletImg, -bullet.width / 2, -bullet.height / 2, bullet.width, bullet.height);
        ctx.restore();

        // Удаление пуль за пределами мира
        if (bullet.x < 0 || bullet.x > worldWidth ||
            bullet.y < 0 || bullet.y > worldHeight) {
            bullets.splice(i, 1);
        }
    }
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        // Движение врага к игроку
        const angle = Math.atan2(
            player.y + player.height / 2 - (enemy.y + enemy.height / 2),
            player.x + player.width / 2 - (enemy.x + enemy.width / 2)
        );

        const dx = Math.cos(angle) * enemy.speed;
        const dy = Math.sin(angle) * enemy.speed;

        let moved = false;
        const oldX = enemy.x;
        const oldY = enemy.y;

        // 1. Пробуем двигаться по обоим осям
        enemy.x += dx;
        enemy.y += dy;
        if (!isCollidingWithObstacles(enemy)) {
            moved = true;
        } else {
            // 2. Если не получилось, пробуем только по X
            enemy.x = oldX + dx;
            enemy.y = oldY;
            if (!isCollidingWithObstacles(enemy)) {
                moved = true;
            } else {
                // 3. Если не получилось, пробуем только по Y
                enemy.x = oldX;
                enemy.y = oldY + dy;
                if (!isCollidingWithObstacles(enemy)) {
                    moved = true;
                } else {
                    // 4. Если не получилось, остаёмся на месте
                    enemy.x = oldX;
                    enemy.y = oldY;
                }
            }
        }

        ctx.save();
        ctx.translate(
            enemy.x - cameraOffset.x + enemy.width / 2,
            enemy.y - cameraOffset.y + enemy.height / 2
        );

        // Поворот врага в сторону игрока
        const angleToPlayer = Math.atan2(
            player.y + player.height / 2 - (enemy.y + enemy.height / 2),
            player.x + player.width / 2 - (enemy.x + enemy.width / 2)
        );
        ctx.rotate(angleToPlayer);

        // Отрисовка изображения врага с поворотом
        ctx.drawImage(
            enemyImg,
            -enemy.width / 2,
            -enemy.height / 2,
            enemy.width,
            enemy.height
        );

        ctx.restore();
    }
}

function checkCollisions() {
    console.log('Checking collisions...');
    // Проверка столкновений пуль с врагами
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        console.log('Checking bullet:', { x: bullet.x, y: bullet.y });

        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            console.log('Checking enemy:', { x: enemy.x, y: enemy.y });

            if (
                bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y
            ) {
                // Столкновение обнаружено
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score++;
                updateScore();
                break;
            }
        }
    }

    // Проверка столкновений игрока с врагами
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        if (
            player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y
        ) {
            // Столкновение с игроком
            enemies.splice(i, 1);
            lives--;
            updateLives();

            if (lives <= 0) {
                gameOver();
            }
        }
    }

    // Проверка сбора бонусов игроком
    for (let i = bonuses.length - 1; i >= 0; i--) {
        const bonus = bonuses[i];
        if (
            player.x < bonus.x + BONUS_SIZE &&
            player.x + player.width > bonus.x &&
            player.y < bonus.y + BONUS_SIZE &&
            player.y + player.height > bonus.y
        ) {
            if (bonus.type === BONUS_TYPES.LIFE) {
                if (lives < MAX_LIVES) {
                    lives++;
                    updateLives();
                }
            } else if (bonus.type === BONUS_TYPES.SPEED) {
                if (!speedBonusActive) {
                    player.speed *= SPEED_BONUS_MULT;
                }
                speedBonusActive = true;
                speedBonusTimer = SPEED_BONUS_DURATION;
            }
            bonuses.splice(i, 1);
        }
    }
}

function updateScore() {
    scoreElement.textContent = `Счёт: ${score}`;
}

function updateLives() {
    livesElement.textContent = `Жизни: ${lives}`;
}

// --- Главное меню и О игре ---
const mainMenu = document.getElementById('main-menu');
const aboutModal = document.getElementById('about-modal');
const menuStartBtn = document.getElementById('menu-start-btn');
const aboutBtn = document.getElementById('about-btn');
const aboutBackBtn = document.getElementById('about-back-btn');
const gameContainer = document.getElementById('game-container');

menuStartBtn.addEventListener('click', () => {
    mainMenu.style.display = 'none';
    gameContainer.style.display = 'block';
    startGame();
});

aboutBtn.addEventListener('click', () => {
    aboutModal.style.display = 'flex';
});

aboutBackBtn.addEventListener('click', () => {
    aboutModal.style.display = 'none';
});

// При окончании игры возвращаемся в главное меню
function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    startBtn.style.display = 'block';
    startBtn.textContent = 'Играть снова';

    // Показ сообщения о конце игры
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Игра окончена!', canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = '24px Arial';
    ctx.fillText(`Ваш счёт: ${score}`, canvas.width / 2, canvas.height / 2 + 30);

    // Через 2 секунды возвращаемся в меню
    setTimeout(() => {
        gameContainer.style.display = 'none';
        mainMenu.style.display = 'flex';
    }, 2000);
}

function drawMiniMap() {
    const mapSize = 200;
    const padding = 10;
    const scaleX = mapSize / worldWidth;
    const scaleY = mapSize / worldHeight;
    const mapX = canvas.width - mapSize - padding;
    const mapY = padding;

    // Фон мини-карты
    ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);

    // Игрок
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(
        mapX + player.x * scaleX,
        mapY + player.y * scaleY,
        4,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Враги
    ctx.fillStyle = '#e74c3c';
    enemies.forEach(enemy => {
        ctx.beginPath();
        ctx.arc(
            mapX + enemy.x * scaleX,
            mapY + enemy.y * scaleY,
            3,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });

    // Рамка
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);
}

function spawnBonus() {
    // Случайно выбираем тип бонуса
    const type = Math.random() < 0.5 ? BONUS_TYPES.LIFE : BONUS_TYPES.SPEED;
    // Случайная позиция, не в центре
    let x, y;
    do {
        x = Math.random() * (worldWidth - BONUS_SIZE);
        y = Math.random() * (worldHeight - BONUS_SIZE);
    } while (
        Math.abs(x - player.x) < 200 && Math.abs(y - player.y) < 200
    );
    bonuses.push({ x, y, type, width: BONUS_SIZE, height: BONUS_SIZE });
}

// Периодический спавн бонусов
setInterval(() => {
    if (bonuses.length < 3 && gameRunning) {
        spawnBonus();
    }
}, 5000);

function keyIsDown(key) {
    // Проверка, зажата ли клавиша (для автомата)
    return !!pressedKeys[key];
}
const pressedKeys = {};
window.addEventListener('keydown', e => { pressedKeys[e.key] = true; });
window.addEventListener('keyup', e => { pressedKeys[e.key] = false; });