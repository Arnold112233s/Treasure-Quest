// Initialize game variables
let balanceText, freeSpinsText, betText, autoplayText, historyText, reels, winText;

// Cleanup previous application if exists
if (window.__slotMachineApp) {
    window.__slotMachineApp.destroy(true);
    document.querySelector('canvas')?.remove();
}

// Initialize PIXI Application
const app = new PIXI.Application({
    width: 1200,
    height: 800,
    backgroundColor: 0x0a0a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
});
window.__slotMachineApp = app;
document.body.appendChild(app.view);

// Register GSAP PixiPlugin
if (typeof PixiPlugin !== 'undefined') {
    gsap.registerPlugin(PixiPlugin);
} else {
    console.error('PixiPlugin not found. GSAP PIXI animations (e.g., tint) will not work.');
}

// Show loading screen
const loadingDiv = document.getElementById('loading');
loadingDiv.style.display = 'block';

// ======== SOUND MANAGER ========
class SoundManager {
    constructor() {
        this.sounds = {
            spin: null,
            win: null,
            bonus: null,
            background: null
        };
        this.isBackgroundPlaying = false;
        this.isMuted = false;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async loadSounds() {
        try {
            if (!PIXI.sound || !PIXI.sound.Sound) {
                throw new Error('PIXI.sound is not available. Ensure @pixi/sound script is included in index.html.');
            }
            this.sounds.spin = await PIXI.sound.Sound.from({
                url: 'assets/sounds/spin.mp3',
                preload: true,
                volume: 0.5
            });
            this.sounds.win = await PIXI.sound.Sound.from({
                url: 'assets/sounds/win.mp3',
                preload: true,
                volume: 0.7
            });
            this.sounds.bonus = await PIXI.sound.Sound.from({
                url: 'assets/sounds/bonus.mp3',
                preload: true,
                volume: 0.6
            });
            this.sounds.background = await PIXI.sound.Sound.from({
                url: 'assets/sounds/background.mp3',
                preload: true,
                volume: 0.3,
                loop: true
            });
            console.log('Sounds loaded successfully');
        } catch (error) {
            console.error('Failed to load sounds:', error.message);
        }
    }

    play(type) {
        if (this.sounds[type] && !this.isMuted) {
            this.sounds[type].stop();
            this.sounds[type].play();
        }
    }

    playBackground() {
        if (this.sounds.background && !this.isBackgroundPlaying && !this.isMuted) {
            this.sounds.background.play();
            this.isBackgroundPlaying = true;
        }
    }

    pauseBackground() {
        if (this.sounds.background && this.isBackgroundPlaying) {
            this.sounds.background.pause();
            this.isBackgroundPlaying = false;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.pauseBackground();
        } else {
            this.playBackground();
        }
        return this.isMuted;
    }

    stopAll() {
        Object.values(this.sounds).forEach(sound => {
            if (sound) sound.stop();
        });
        this.isBackgroundPlaying = false;
    }
}

const soundManager = new SoundManager();

// ======== CONFIG ========
const CONFIG = {
    REELS: 5,
    ROWS: 3,
    SYMBOL_SIZE: 120,
    SPIN_DURATION: 1500,
    BET_LEVELS: [1, 2, 5, 10, 20, 50, 100],
    SYMBOLS: [
        { name: "COIN", color: 0xFFD700, value: 10, weight: 40 },
        { name: "RING", color: 0xE5E4E2, value: 15, weight: 30 },
        { name: "GEM", color: 0x00FFAA, value: 20, weight: 20 },
        { name: "MAP", color: 0x8B4513, value: 0, isBonus: true, weight: 5 },
        { name: "CHEST", color: 0xCD7F32, value: 0, isScatter: true, weight: 3 },
        { name: "CROWN", color: 0xFFAA00, value: 30, weight: 10 }
    ],
    PAYTABLE: {
        COIN: { 3: 0.5, 4: 1, 5: 5 },
        RING: { 3: 0.75, 4: 1.5, 5: 7.5 },
        GEM: { 3: 1, 4: 2.5, 5: 10 },
        CROWN: { 3: 1.5, 4: 3.75, 5: 25 }
    },
    FREE_SPINS: {
        TRIGGER: 3,
        BASE_COUNT: 10,
        MULTIPLIER: 2
    },
    CHEST_PRIZE: 50,
    RTP: 0.96,
    MAX_WIN: 5000,
    AUTOPLAY_OPTIONS: [10, 25, 50, 100],
    UI: {
        TEXT_STYLES: {
            BALANCE: { fontSize: 24, fill: 0xFFD700, fontWeight: 'bold', fontFamily: 'Roboto Condensed' },
            FREESPINS: { fontSize: 28, fill: 0x00FF00, fontWeight: 'bold', fontFamily: 'Arial Black', dropShadow: true, dropShadowColor: 0x000000, dropShadowDistance: 2 },
            MULTIPLIER: { fontSize: 28, fill: 0xFFAA00, fontWeight: 'bold', fontFamily: 'Arial Black', dropShadow: true, dropShadowColor: 0x000000, dropShadowDistance: 2 },
            BET: { fontSize: 24, fill: 0xFFFFFF, fontWeight: 'bold', fontFamily: 'Roboto Condensed' },
            HISTORY: { fontSize: 20, fill: 0xFFFFFF, fontFamily: 'Roboto Condensed' },
            WARNING: { fontSize: 16, fill: 0xFFFFFF, fontFamily: 'Roboto Condensed' }
        }
    }
};

// ======== GAME STATE ========
class GameState {
    constructor() {
        this.balance = 1000;
        this.currentBet = CONFIG.BET_LEVELS[0];
        this.isSpinning = false;
        this.isAutoplay = false;
        this.autoplayCount = 0;
        this.freeSpins = 0;
        this.currentFreeSpin = 0;
        this.spinMultiplier = 1;
        this.bonusTotalWin = 0;
        this.gameHistory = [];
    }

    updateBalance(amount) {
        this.balance += amount;
        if (this.balance > CONFIG.MAX_WIN) this.balance = CONFIG.MAX_WIN;
        if (this.balance < 0) this.balance = 0;
    }
}

const state = new GameState();

// ======== RENDERING ========
function createSymbolGraphic(symbol) {
    const container = new PIXI.Container();
    container.width = CONFIG.SYMBOL_SIZE;
    container.height = CONFIG.SYMBOL_SIZE;

    const SYMBOL_CONFIG = {
        crown: { image: 'crown.png', bonusEffect: false },
        ring: { image: 'ring.png', bonusEffect: false },
        coin: { image: 'coin.png', bonusEffect: false },
        chest: { image: 'chest.png', bonusEffect: false, scatterEffect: true },
        gem: { image: 'gem.png', bonusEffect: false },
        map: { image: 'map.png', bonusEffect: true, scatterEffect: false }
    };

    const symbolConfig = SYMBOL_CONFIG[symbol.name.toLowerCase()];

    try {
        const sprite = PIXI.Sprite.from(`assets/symbols/${symbolConfig.image}`);
        sprite.width = CONFIG.SYMBOL_SIZE - 20;
        sprite.height = CONFIG.SYMBOL_SIZE - 20;
        sprite.anchor.set(0.5);
        sprite.position.set(CONFIG.SYMBOL_SIZE / 2, CONFIG.SYMBOL_SIZE / 2);
        container.addChild(sprite);

        if (symbolConfig.bonusEffect || symbol.isBonus) {
            const sparkle = new PIXI.Graphics()
                .beginFill(0xFFFF00, 0.3)
                .endFill();
            sparkle.position.set(CONFIG.SYMBOL_SIZE / 2, CONFIG.SYMBOL_SIZE / 2);
            container.addChild(sparkle);
            
            const particles = new PIXI.Container();
            container.addChild(particles);
            
            gsap.to(sparkle, { 
                rotation: 360, 
                duration: 5, 
                repeat: -1, 
                ease: 'none' 
            });
            
            setInterval(() => {
                const sparkleCount = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < sparkleCount; i++) {
                    const sparkle = new PIXI.Graphics()
                        .beginFill(0xFFFFFF)
                        .drawCircle(0, 0, 2 + Math.random() * 3)
                        .endFill();
                    sparkle.position.set(
                        CONFIG.SYMBOL_SIZE/2 + (Math.random() * 30 - 15),
                        CONFIG.SYMBOL_SIZE/2 + (Math.random() * 30 - 15)
                    );
                    particles.addChild(sparkle);
                    gsap.to(sparkle, {
                        alpha: 0,
                        y: sparkle.y - 20,
                        duration: 0.5,
                        onComplete: () => particles.removeChild(sparkle)
                    });
                }
            }, 2000);
        }
        
        if (symbolConfig.scatterEffect || symbol.isScatter) {
            const halo = new PIXI.Graphics()
                .beginFill(0x00AAFF, 0.2)
                .endFill();
            halo.position.set(CONFIG.SYMBOL_SIZE / 2, CONFIG.SYMBOL_SIZE / 2);
            container.addChildAt(halo, 0);
            gsap.to(halo.scale, {
                x: 1.1,
                y: 1.1,
                duration: 1,
                yoyo: true,
                repeat: -1,
                ease: 'sine.inOut'
            });
        }
    } catch (error) {
        const label = new PIXI.Text(
            symbol.name.substring(0, 4),
            {
                fontSize: 24,
                fill: 0xFFFFFF,
                fontWeight: 'bold',
                fontFamily: 'Roboto Condensed',
                dropShadow: true,
                dropShadowDistance: 2
            }
        );
        label.anchor.set(0.5);
        label.position.set(CONFIG.SYMBOL_SIZE / 2, CONFIG.SYMBOL_SIZE / 2);
        container.addChild(label);
    }

    container.scale.set(0);
    container.alpha = 0;
    gsap.to(container.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out' });
    gsap.to(container, { alpha: 1, duration: 0.2 });

    container.symbol = symbol;
    return { container, symbol };
}

// ======== UI SETUP ========
function createSpinButton() {
    const button = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0xFFD700)
        .drawRoundedRect(0, 0, 220, 70, 20)
        .endFill()
        .lineStyle(4, 0xFFFFFF)
        .drawRoundedRect(0, 0, 220, 70, 20)
        .beginFill(0xDAA520, 0.8)
        .drawRoundedRect(5, 5, 210, 60, 15)
        .endFill();
    button.addChild(bg);

    const text = new PIXI.Text(state.freeSpins > 0 ? 'FREE SPIN' : `SPIN`, {
        fontSize: 32,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 2
    });
    text.anchor.set(0.5);
    text.position.set(110, 35);
    button.addChild(text);

    button.position.set((app.screen.width - 220) / 2, app.screen.height - 90);
    button.interactive = true;
    button.buttonMode = true;

    button.on('pointerover', () => {
        gsap.to(button.scale, { x: 1.05, y: 1.05, duration: 0.2 });
        gsap.to(bg, { pixi: { tint: 0xFFFFE0 }, duration: 0.2 });
    });
    button.on('pointerout', () => {
        gsap.to(button.scale, { x: 1, y: 1, duration: 0.2 });
        gsap.to(bg, { pixi: { tint: 0xFFFFFF }, duration: 0.2 });
    });
    button.on('pointerdown', () => startSpin());

    return button;
}

function createAutoplayButton() {
    const button = new PIXI.Container();
    const graphics = new PIXI.Graphics()
        .beginFill(0x666666)
        .drawRoundedRect(0, 0, 50, 50, 10)
        .endFill();
    button.addChild(graphics);

    const text = new PIXI.Text('⭮', {
        fontFamily: 'Roboto Condensed',
        fontSize: 30,
        fill: 0x000000,
        fontWeight: 'bold',
    });
    text.anchor.set(0.5);
    text.position.set(25, 25);
    button.addChild(text);

    button.position.set(app.screen.width - 220, app.screen.height - 80);
    button.interactive = true;
    button.buttonMode = true;
    button.on('pointerdown', () => {
        if (state.isSpinning || state.freeSpins > 0) return;

        if (state.isAutoplay) {
            state.isAutoplay = false;
            state.autoplayCount = 0;
            autoplayText.text = '';
            text.text = '⭮';
        } else {
            state.isAutoplay = true;
            state.autoplayCount = CONFIG.AUTOPLAY_OPTIONS[0];
            autoplayText.text = `AUTOPLAY: ${state.autoplayCount} spins`;
            text.text = 'STOP';
            startSpin();
        }
    });

    return button;
}

function createBetButton(isUp) {
    const button = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0x666666)
        .drawRoundedRect(0, 0, 50, 50, 10)
        .endFill();
    button.addChild(bg);

    const text = new PIXI.Text(isUp ? '+' : '-', {
        fontSize: 28,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed'
    });
    text.anchor.set(0.5);
    text.position.set(25, 25);
    button.addChild(text);

    button.interactive = true;
    button.buttonMode = true;
    button.on('pointerdown', () => {
        const currentIndex = CONFIG.BET_LEVELS.indexOf(state.currentBet);
        if (isUp && currentIndex < CONFIG.BET_LEVELS.length - 1) {
            state.currentBet = CONFIG.BET_LEVELS[currentIndex + 1];
        } else if (!isUp && currentIndex > 0) {
            state.currentBet = CONFIG.BET_LEVELS[currentIndex - 1];
        }
        betText.text = `BET: $${state.currentBet}`;
    });

    return button;
}



function createMuteButton() {
    const button = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0x333333)
        .drawRoundedRect(0, 0, 80, 50, 10)
        .endFill()
        .lineStyle(2, 0xFFFFFF)
        .drawRoundedRect(0, 0, 80, 50, 10);
    button.addChild(bg);

    const text = new PIXI.Text('MUTE', {
        fontSize: 20,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed',
        fontWeight: 'bold'
    });
    text.anchor.set(0.5);
    text.position.set(40, 25);
    button.addChild(text);

    button.position.set(app.screen.width - 100, 20);
    button.interactive = true;
    button.buttonMode = true;

    button.on('pointerdown', () => {
        const isMuted = soundManager.toggleMute();
        text.text = isMuted ? 'UNMUTE' : 'MUTE';
    });

    return button;
}

function createWinBar() {
    const winBar = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0x1a1a1a, 0.9)
        .drawRoundedRect(0, 0, CONFIG.REELS * CONFIG.SYMBOL_SIZE, 70, 20)
        .endFill();
    winBar.addChild(bg);

    const gradient = new PIXI.Graphics()
        .beginFill(0x333333, 0.5)
        .drawRoundedRect(0, 0, CONFIG.REELS * CONFIG.SYMBOL_SIZE, 35, 20)
        .endFill();
    gradient.position.set(0, 35);
    winBar.addChild(gradient);

    const border = new PIXI.Graphics()
        .lineStyle(4, 0xFFFFFF)
        .drawRoundedRect(0, 0, CONFIG.REELS * CONFIG.SYMBOL_SIZE, 70, 20);
    winBar.addChild(border);

    const glow = new PIXI.Graphics()
        .beginFill(0x333333, 0.2)
        .drawRoundedRect(-10, -10, CONFIG.REELS * CONFIG.SYMBOL_SIZE + 20, 90, 30)
        .endFill();
    glow.alpha = 0.5;
    winBar.addChildAt(glow, 0);

    const winText = new PIXI.Text('WIN: $0.00', {
        fontSize: 32,
        fill: 0xFFFFFF,
        fontFamily: 'Arial Black',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 3,
        align: 'center',
    });
    winText.anchor.set(0.5);
    winText.position.set((CONFIG.REELS * CONFIG.SYMBOL_SIZE) / 2, 35);
    winBar.addChild(winText);

    gsap.from(winBar, { alpha: 0, duration: 0.5, ease: 'power1.out' });
    window._winText = winText;

    window.updateWinDisplay = (amount) => {
        window._winText.text = `WIN: $${amount.toFixed(2)}`;
        // Removed the jumping effect (scaling animation) on winText
        gsap.fromTo(
            glow,
            { alpha: 0.8 },
            { alpha: 0.5, duration: 0.6, ease: 'sine.inOut' }
        );
    };

    winBar.position.set(
        (app.screen.width - (CONFIG.REELS * CONFIG.SYMBOL_SIZE)) / 2,
        20
    );

    return winBar;
}

function createFreeSpinsIcon() {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0x1a2a44)
        .drawRoundedRect(0, 0, 200, 60, 15)
        .endFill()
        .beginFill(0x2e4057, 0.8)
        .drawRoundedRect(5, 5, 190, 50, 12)
        .endFill()
        .lineStyle(2, 0x00FF00)
        .drawRoundedRect(0, 0, 200, 60, 15);
    container.addChild(bg);

    const text = new PIXI.Text('FREE SPINS: 0', {
        fontSize: 18,
        fill: 0x00FF00,
        fontFamily: 'Arial Black',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 2,
    });
    text.anchor.set(0.5);
    text.position.set(bg.width / 2, bg.height / 2);
    container.addChild(text);

    const progressBarBg = new PIXI.Graphics()
        .beginFill(0x333333, 0.5)
        .drawRect(10, 40, 180, 10)
        .endFill();
    container.addChild(progressBarBg);

    const progressBar = new PIXI.Graphics()
        .beginFill(0x00FF00)
        .drawRect(10, 40, 0, 10)
        .endFill();
    container.addChild(progressBar);
    window._progressBar = progressBar;

    container.visible = false;

    window.updateFreeSpinsProgress = (total, remaining) => {
        const progress = (remaining / total) * 180;
        gsap.to(progressBar, { width: progress, duration: 0.3, ease: 'power1.out' });
    };

    return { container, text };
}

function createMultiplierIcon() {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics()
        .beginFill(0x1a2a44)
        .drawRoundedRect(0, 0, 200, 60, 15)
        .endFill()
        .beginFill(0x2e4057, 0.8)
        .drawRoundedRect(5, 5, 190, 50, 12)
        .endFill()
        .lineStyle(2, 0xFFAA00)
        .drawRoundedRect(0, 0, 200, 60, 15);
    container.addChild(bg);

    const text = new PIXI.Text('MULTIPLIER: 1x', {
        fontSize: 18,
        fill: 0xFFAA00,
        fontFamily: 'Arial Black',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 2,
    });
    text.anchor.set(0.5);
    text.position.set(bg.width / 2, bg.height / 2);
    container.addChild(text);

    gsap.to(text, {
        alpha: 0.9,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });

    container.visible = false;

    return { container, text };
}

// ======== GAME LOGIC ========
function getRandomSymbol() {
    const totalWeight = CONFIG.SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const symbol of CONFIG.SYMBOLS) {
        if (random < symbol.weight) return symbol;
        random -= symbol.weight;
    }
    
    return CONFIG.SYMBOLS[0];
}

function startSpin(isFirstBonusSpin = false, isManualSpin = true) {
    if (isManualSpin && state.isSpinning) {
        console.warn('Cannot spin while already spinning.');
        return;
    }

    if (isManualSpin && state.freeSpins > 0) {
        console.warn('Cannot manually spin during a bonus round.');
        return;
    }

    if (isManualSpin && state.freeSpins === 0 && state.balance < state.currentBet) {
        console.warn('Insufficient balance to spin.');
        return;
    }

    console.log('Starting spin...');
    state.isSpinning = true;
    soundManager.play('spin');

    // Handle free spins logic only for subsequent spins, not the first bonus spin
    if (state.freeSpins > 0 && !isFirstBonusSpin) {
        state.freeSpins--;
        state.currentFreeSpin++;
        state.spinMultiplier = state.currentFreeSpin;

        if (isNaN(state.spinMultiplier)) state.spinMultiplier = 1;

        window._freeSpinsText.text = `FREE SPINS: ${state.freeSpins}`;
        window._multiplierText.text = `MULTIPLIER: ${state.spinMultiplier}x`;
        window.updateFreeSpinsProgress(6, state.freeSpins);
    } else if (!isFirstBonusSpin && state.freeSpins === 0) {
        state.updateBalance(-state.currentBet);
        window.updateWinDisplay(0);
    }

    // Show icons on the first bonus spin and update them on subsequent spins
    if (state.freeSpins > 0) {
        window._freeSpinsContainer.visible = true;
        window._multiplierContainer.visible = true;
    }

    balanceText.text = `CREDITS: $${state.balance.toFixed(2)}`;
    betText.text = `BET: $${state.currentBet}`;
    state.gameHistory.push({ bet: state.currentBet, win: 0, timestamp: new Date() });
    historyText.text = `HISTORY: ${state.gameHistory.length} spins`;

    spinReels();
}

function spinReels() {
    state.isSpinning = true;
    let reelsStopped = 0;
    let scatterCount = 0;
    let mapCount = 0;

    const reelsContainer = app.stage.getChildAt(1);
    const reels = reelsContainer.children;
    
    reels.forEach((reel, i) => {
        const time = CONFIG.SPIN_DURATION + i * 600;
        gsap.to(reel, {
            y: reel.y + CONFIG.SYMBOL_SIZE * 10,
            duration: time / 1000,
            ease: 'power3.out',
            onComplete: () => {
                reel.y = 0;
                reel.children.forEach((symbol, j) => {
                    const newSymbol = getRandomSymbol();
                    const { container } = createSymbolGraphic(newSymbol);
                    container.y = j * CONFIG.SYMBOL_SIZE;
                    reel.removeChildAt(0);
                    reel.addChild(container);

                    if (j <= 2) {
                        if (newSymbol.isScatter) scatterCount++;
                        if (newSymbol.name === "MAP") mapCount++;
                    }
                });

                if (++reelsStopped === CONFIG.REELS) {
                    state.isSpinning = false;
                    console.log('Spin complete');

                    if (scatterCount >= 3) {
                        const chestWin = CONFIG.CHEST_PRIZE * scatterCount;
                        state.updateBalance(chestWin);
                        balanceText.text = `CREDITS: $${state.balance.toFixed(2)}`;
                        showWinMessage(chestWin);
                        soundManager.play('win');
                    }

                    if (mapCount >= 3) {
                        if (state.freeSpins === 0) {
                            triggerFreeSpins(mapCount);
                        } else {
                            state.freeSpins += 6;
                            window._freeSpinsText.text = `FREE SPINS: ${state.freeSpins}`;
                            showBonusMessage("BONUS TRIGGERED! +6 FREE SPINS!");
                            soundManager.play('bonus');
                        }
                    }

                    const win = checkWins();
                    state.gameHistory[state.gameHistory.length - 1].win = win;

                    if (state.freeSpins > 0) {
                        setTimeout(() => {
                            if (!state.isSpinning) startSpin(false, false);
                        }, CONFIG.SPIN_DURATION + 1000);
                    } else if (state.isAutoplay && state.autoplayCount > 0) {
                        state.autoplayCount--;
                        autoplayText.text = `AUTOPLAY: ${state.autoplayCount} spins`;
                        if (state.autoplayCount === 0) {
                            state.isAutoplay = false;
                            autoplayText.text = '';
                        } else {
                            setTimeout(() => startSpin(), CONFIG.SPIN_DURATION + 500);
                        }
                    }
                }
            }
        });
    });
}

function checkWins() {
    let totalWin = 0;
    const lines = [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [2, 2, 2, 2, 2],
        [0, 1, 2, 1, 0],
        [2, 1, 0, 1, 2],
    ];

    const reels = app.stage.getChildAt(1).children;
    const winningPositions = [];

    lines.forEach((line) => {
        const symbols = line.map((row, reelIdx) => {
            return reels[reelIdx]?.children[row]?.symbol;
        }).filter(Boolean);

        if (symbols.length !== CONFIG.REELS) return;

        let count = 1;
        const firstSymbol = symbols[0];
        for (let i = 1; i < symbols.length; i++) {
            if (symbols[i].name === firstSymbol.name) count++;
            else break;
        }

        if (count >= 3 && firstSymbol.value > 0 && CONFIG.PAYTABLE[firstSymbol.name]) {
            let winMultiplier = CONFIG.PAYTABLE[firstSymbol.name][count];
            const randomMultiplier = state.freeSpins > 0 ? 1 : (1 + Math.floor(Math.random() * 3));
            const winAmount = winMultiplier * state.currentBet * state.spinMultiplier * randomMultiplier;
            totalWin += winAmount;

            for (let i = 0; i < count; i++) {
                winningPositions.push({ reelIdx: i, row: line[i] });
            }
        }
    });

    if (winningPositions.length > 0) {
        highlightWinners(winningPositions);
    }

    if (state.freeSpins > 0) {
        state.bonusTotalWin += totalWin;
        window.updateWinDisplay(state.bonusTotalWin);
        if (totalWin > 0) soundManager.play('win');
    } else {
        if (totalWin > 0) {
            state.updateBalance(totalWin);
            balanceText.text = `CREDITS: $${state.balance.toFixed(2)}`;
            window.updateWinDisplay(totalWin);
            soundManager.play('win');
        } else {
            window.updateWinDisplay(0);
        }
    }

    if (state.currentFreeSpin > 0 && state.freeSpins === 0) {
        setTimeout(() => {
            if (state.bonusTotalWin > 0) {
                state.updateBalance(state.bonusTotalWin);
                balanceText.text = `CREDITS: $${state.balance.toFixed(2)}`;
            }
            state.currentFreeSpin = 0;
            state.spinMultiplier = 1;
            const totalBonusWin = state.bonusTotalWin;
            state.bonusTotalWin = 0;
            window.updateWinDisplay(0);
            window._freeSpinsContainer.visible = false;
            window._multiplierContainer.visible = false;
            showBonusSummary(totalBonusWin);
        }, 1500);
    }

    return totalWin;
}

function triggerFreeSpins(symbolCount) {
    const additionalSpins = CONFIG.FREE_SPINS.BASE_COUNT + (symbolCount - 3) * 5;
    state.freeSpins += additionalSpins;
    state.currentFreeSpin = 0;
    state.spinMultiplier = 1;

    window._freeSpinsText.text = `FREE SPINS: ${state.freeSpins}`;
    window._multiplierText.text = `MULTIPLIER: ${state.spinMultiplier}x`;
    window.updateFreeSpinsProgress(6, state.freeSpins);
    window._freeSpinsContainer.visible = true;
    window._multiplierContainer.visible = true;

    showBonusMessage(`BONUS TRIGGERED! +${additionalSpins} FREE SPINS!`, () => {
        state.isSpinning = false;
        startSpin(true, false);
    });

    soundManager.play('bonus');
}

function buyBonus() {
    const bonusCost = state.currentBet * 100;
    if (state.isSpinning || state.freeSpins > 0) {
        showBonusMessage("Cannot Buy Bonus Now!");
        return;
    }
    if (state.balance < bonusCost) {
        showBonusMessage("Insufficient Balance!");
        return;
    }

    state.balance -= bonusCost;
    state.updateBalance(0);
    balanceText.text = `CREDITS: $${state.balance.toFixed(2)}`;

    fakeSpinForBonus();
}

function fakeSpinForBonus() {
    state.isSpinning = true;
    let reelsStopped = 0;
    let mapCount = 0;

    const reels = app.stage.getChildAt(1).children;
    state.gameHistory.push({ bet: state.currentBet, win: 0, timestamp: new Date() });
    historyText.text = `HISTORY: ${state.gameHistory.length} spins`;

    reels.forEach((reel, i) => {
        const time = CONFIG.SPIN_DURATION + i * 150;
        gsap.to(reel, {
            y: reel.y + CONFIG.SYMBOL_SIZE * 10,
            duration: time / 1000,
            ease: 'power3.out',
            onComplete: () => {
                reel.y = 0;
                reel.children.forEach((symbol, j) => {
                    let newSymbol;
                    if (j === 1 && i < 3 && mapCount < 3) {
                        newSymbol = CONFIG.SYMBOLS.find(s => s.name === "MAP");
                        mapCount++;
                    } else {
                        newSymbol = getRandomSymbol();
                    }
                    const { container } = createSymbolGraphic(newSymbol);
                    container.y = j * CONFIG.SYMBOL_SIZE;
                    reel.removeChildAt(0);
                    reel.addChild(container);
                });

                if (++reelsStopped === CONFIG.REELS) {
                    state.isSpinning = false;
                    const win = checkWins();
                    state.gameHistory[state.gameHistory.length - 1].win = win;

                    if (mapCount >= 3) {
                        state.bonusTotalWin = win;
                        state.freeSpins = 6;
                        window._freeSpinsText.text = `FREE SPINS: ${state.freeSpins}`; // Show 6 initially
                        window.updateWinDisplay(state.bonusTotalWin);
                        showBonusMessage("BONUS TRIGGERED!", () => {
                            state.isSpinning = false;
                            startSpin(true, false); // First bonus spin, won’t decrement
                        });
                        soundManager.play('bonus');
                    }
                }
            }
        });
    });
}

function highlightWinners(winningPositions) {
    const reelsContainer = app.stage.getChildAt(1);
    soundManager.play('win');

    winningPositions.forEach(({ reelIdx, row }) => {
        const reel = reels[reelIdx];
        const symbol = reel.children[row];
        const highlight = new PIXI.Graphics()
            .lineStyle(4, 0xFFD700)
            .beginFill(0xFFD700, 0.2)
            .drawRect(-5, -5, CONFIG.SYMBOL_SIZE + 10, CONFIG.SYMBOL_SIZE + 10)
            .endFill();
        symbol.addChildAt(highlight, 0);

        gsap.to(highlight, {
            alpha: 0,
            duration: 1.5,
            onComplete: () => symbol.removeChild(highlight)
        });
    });
}

function showBonusMessage(message, onStartBonus) {
    const container = new PIXI.Container();
    const background = new PIXI.Graphics()
        .beginFill(0x000000, 0.7)
        .drawRect(0, 0, app.screen.width, app.screen.height)
        .endFill();
    container.addChild(background);

    const bonusImage = PIXI.Sprite.from('assets/bonus_image.png');
    bonusImage.anchor.set(0.5);
    bonusImage.position.set(app.screen.width / 2, app.screen.height / 2);
    bonusImage.width = app.screen.width;
    bonusImage.height = app.screen.height;
    bonusImage.alpha = 0.5;
    container.addChild(bonusImage);

    const text = new PIXI.Text(message, {
        fontSize: 48,
        fill: 0xFFD700,
        fontFamily: 'Arial Black',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 4,
        align: 'center',
    });
    text.anchor.set(0.5);
    text.position.set(app.screen.width / 2, app.screen.height / 2 + 100);
    container.addChild(text);

    const button = new PIXI.Container();
    const buttonBg = new PIXI.Graphics()
        .beginFill(0xFF4500)
        .drawRoundedRect(0, 0, 200, 60, 15)
        .endFill()
        .lineStyle(2, 0xFFFFFF)
        .drawRoundedRect(0, 0, 200, 60, 15);
    const buttonText = new PIXI.Text('START BONUS', {
        fontSize: 24,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed',
        fontWeight: 'bold',
    });
    buttonText.anchor.set(0.5);
    buttonText.position.set(100, 30);
    button.addChild(buttonBg, buttonText);
    button.position.set((app.screen.width - 200) / 2, app.screen.height / 2 + 200);
    button.interactive = true;
    button.buttonMode = true;
    button.on('pointerdown', () => {
        app.stage.removeChild(container);
        if (onStartBonus) onStartBonus();
    });
    container.addChild(button);

    app.stage.addChild(container);
    gsap.from(container, { alpha: 0, duration: 0.5, ease: 'power1.out' });
    gsap.from(text.scale, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
    gsap.from(button.scale, { x: 0, y: 0, duration: 0.5, ease: 'back.out(1.7)' });
}

function exportHistory() {
    const data = JSON.stringify(state.gameHistory, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'game_history.json';
    link.click();
    URL.revokeObjectURL(url);
}

function showBonusSummary(totalWin) {
    const summaryContainer = new PIXI.Container();
    const background = new PIXI.Graphics()
        .beginFill(0x000000, 0.8)
        .drawRect(0, 0, app.screen.width, app.screen.height)
        .endFill();
    summaryContainer.addChild(background);

    const title = new PIXI.Text('BONUS SUMMARY', {
        fontSize: 48,
        fill: 0xFFD700,
        fontFamily: 'Arial Black',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 3,
    });
    title.anchor.set(0.5);
    title.position.set(app.screen.width / 2, app.screen.height / 2 - 100);
    summaryContainer.addChild(title);

    const winText = new PIXI.Text(`TOTAL WIN: $${totalWin.toFixed(2)}`, {
        fontSize: 36,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed',
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 2,
    });
    winText.anchor.set(0.5);
    winText.position.set(app.screen.width / 2, app.screen.height / 2);
    summaryContainer.addChild(winText);

    const dismissButton = new PIXI.Graphics()
        .beginFill(0xFF4500)
        .drawRoundedRect(0, 0, 200, 60, 15)
        .endFill()
        .lineStyle(2, 0xFFFFFF)
        .drawRoundedRect(0, 0, 200, 60, 15);
    dismissButton.position.set((app.screen.width - 200) / 2, app.screen.height / 2 + 100);
    dismissButton.interactive = true;
    dismissButton.buttonMode = true;
    const dismissText = new PIXI.Text('CONTINUE', {
        fontSize: 24,
        fill: 0xFFFFFF,
        fontFamily: 'Roboto Condensed',
        fontWeight: 'bold',
    });
    dismissText.anchor.set(0.5);
    dismissText.position.set(100, 30);
    dismissButton.addChild(dismissText);
    dismissButton.on('pointerdown', () => app.stage.removeChild(summaryContainer));
    summaryContainer.addChild(dismissButton);

    app.stage.addChild(summaryContainer);
}

// ======== GAME SETUP ========
function setupGame() {
    loadingDiv.style.display = 'none';

    const background = new PIXI.Sprite(PIXI.Assets.get('assets/background.png'));
    background.width = app.screen.width;
    background.height = app.screen.height;
    background.alpha = 0;
    app.stage.addChildAt(background, 0);
    gsap.to(background, { alpha: 1, duration: 1 });

    const reelsContainer = new PIXI.Container();
    reelsContainer.position.set(
        (app.screen.width - (CONFIG.REELS * CONFIG.SYMBOL_SIZE)) / 2,
        100
    );
    app.stage.addChild(reelsContainer);

    reels = [];
    for (let i = 0; i < CONFIG.REELS; i++) {
        const reel = new PIXI.Container();
        reel.x = i * CONFIG.SYMBOL_SIZE;
        reelsContainer.addChild(reel);
        reels.push(reel);

        for (let j = 0; j < CONFIG.ROWS + 1; j++) {
            const symbol = getRandomSymbol();
            const { container } = createSymbolGraphic(symbol);
            container.y = j * CONFIG.SYMBOL_SIZE;
            reel.addChild(container);
        }
    }

    const uiContainer = new PIXI.Container();
    app.stage.addChild(uiContainer);

    const winBar = createWinBar();
    app.stage.addChild(winBar);

    balanceText = new PIXI.Text(`CREDITS: $${state.balance}`, CONFIG.UI.TEXT_STYLES.BALANCE);
    balanceText.position.set(20, 20);
    uiContainer.addChild(balanceText);

    freeSpinsText = new PIXI.Text('', CONFIG.UI.TEXT_STYLES.FREESPINS);
    freeSpinsText.position.set(20, 60);
    uiContainer.addChild(freeSpinsText);

    betText = new PIXI.Text(`BET: $${state.currentBet}`, CONFIG.UI.TEXT_STYLES.BET);
    betText.position.set(20, 100);
    uiContainer.addChild(betText);

    autoplayText = new PIXI.Text('', CONFIG.UI.TEXT_STYLES.BET);
    autoplayText.position.set(20, 140);
    uiContainer.addChild(autoplayText);

    historyText = new PIXI.Text('HISTORY: 0 spins', CONFIG.UI.TEXT_STYLES.HISTORY);
    historyText.position.set(20, app.screen.height - 30);
    historyText.interactive = true;
    historyText.buttonMode = true;
    historyText.on('pointerdown', exportHistory);
    uiContainer.addChild(historyText);

    

    const spinButton = createSpinButton();
    uiContainer.addChild(spinButton);

    const autoplayButton = createAutoplayButton();
    uiContainer.addChild(autoplayButton);

    const betUp = createBetButton(true);
    const betDown = createBetButton(false);
    betUp.position.set(app.screen.width - 100, app.screen.height - 80);
    betDown.position.set(app.screen.width - 160, app.screen.height - 80);
    uiContainer.addChild(betUp, betDown);

    const muteButton = createMuteButton();
    uiContainer.addChild(muteButton);

    const buyBonusButton = new PIXI.Graphics()
        .beginFill(0xFF4500)
        .drawRoundedRect(0, 0, 150, 50, 10)
        .endFill()
        .lineStyle(2, 0xFFFFFF)
        .drawRoundedRect(0, 0, 150, 50, 10)
        .beginFill(0xFF8C00, 0.8)
        .drawRoundedRect(3, 3, 144, 44, 8)
        .endFill();
    const buyBonusText = new PIXI.Text('BUY BONUS', { 
        fontFamily: 'Roboto Condensed', 
        fontSize: 20,
        fill: 0xFFFFFF, 
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 1
    });
    buyBonusText.anchor.set(0.5);
    buyBonusText.position.set(75, 25);
    buyBonusButton.addChild(buyBonusText);
    buyBonusButton.position.set(30, (app.screen.height / 2) - 100);
    buyBonusButton.interactive = true;
    buyBonusButton.buttonMode = true;
    buyBonusButton.on('pointerdown', buyBonus);
    uiContainer.addChild(buyBonusButton);

    const freeSpinsIcon = createFreeSpinsIcon();
    const multiplierIcon = createMultiplierIcon();
    const reelsRightEdge = reelsContainer.x + (CONFIG.REELS * CONFIG.SYMBOL_SIZE);
    freeSpinsIcon.container.position.set(reelsRightEdge + 20, app.screen.height / 2 - 60);
    multiplierIcon.container.position.set(reelsRightEdge + 20, app.screen.height / 2);
    app.stage.addChild(freeSpinsIcon.container);
    app.stage.addChild(multiplierIcon.container);

    window._freeSpinsText = freeSpinsIcon.text;
    window._multiplierText = multiplierIcon.text;
    window._freeSpinsContainer = freeSpinsIcon.container;
    window._multiplierContainer = multiplierIcon.container;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.isSpinning) startSpin();
    });
}

// ======== INITIALIZATION ========
async function loadAssets() {
    const assetsToLoad = [
        { name: 'background', url: 'assets/background.png' },
        { name: 'chest', url: 'assets/symbols/chest.png' },
        { name: 'coin', url: 'assets/symbols/coin.png' },
        { name: 'ring', url: 'assets/symbols/ring.png' },
        { name: 'gem', url: 'assets/symbols/gem.png' },
        { name: 'map', url: 'assets/symbols/map.png' },
        { name: 'crown', url: 'assets/symbols/crown.png' }
    ];

    try {
        await PIXI.Assets.load(assetsToLoad.map(asset => asset.url));
        await soundManager.loadSounds();

        const startButton = document.getElementById('startButton');
        startButton.addEventListener('click', () => {
            soundManager.playBackground();
            startButton.style.display = 'none';
            setupGame();
        });
    } catch (error) {
        console.error('Failed to load assets:', error);
        alert('Failed to load game assets. Check the file paths and console for details.');
        setupGame();
    }
}

loadAssets().catch(err => {
    console.error('Error during asset loading:', err);
    loadingDiv.style.display = 'none';
    setupGame();
});