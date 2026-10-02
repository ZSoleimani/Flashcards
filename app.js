// app.js — Improved, cleaned, and optimised (functionality unchanged)

// ========== FAVICON FIX ==========
(function fixFavicon() {
    const link = document.querySelector("link[rel*='icon']") || document.createElement("link");
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    link.href =
        "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🌍</text></svg>";

    if (!document.querySelector("link[rel*='icon']")) {
        document.head.appendChild(link);
    }
})();

// ========== CONFIGURATION ==========
const CONFIG = {
    DEFAULT_LANG: "da",
    AUDIO_FORMATS: {
        safari: ".mp3",
        default: ".opus",
    },
    SPEECH_RATE: 0.9,
    CACHE_VERSION: "flashcards-v3",
    IMAGE_PRELOAD_COUNT: 3,
};

// ========== STATE ==========
let currentIndex = 0;
let currentLang = CONFIG.DEFAULT_LANG;
let autoSpeakEnabled = false;
let globalAudio = new Audio();
let isCardFlipped = false;

// ========== DOM ELEMENTS ==========
const elements = {
    categorySelect: document.getElementById("category"),
    flags: document.querySelectorAll(".language-tab"),
    darkModeToggle: document.getElementById("darkModeToggle"),
    flashcard: document.getElementById("flashcard"),
    cardImage: document.getElementById("cardImage"),
    cardWordFront: document.getElementById("cardWordFront"),
    cardWordBack: document.getElementById("cardWordBack"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    playAudioBtn: document.getElementById("playAudioBtn"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    backBtn: document.getElementById("backBtn"),
};

// ========== FLASHCARD APP ==========
class FlashcardApp {
    constructor() {
        this.isInitialized = false;
        this.currentCategory = "";
        this.imageLoader = new ImageLoader();
        this.hasUserInteracted = false;
    }

    // Prevent zoom and ensure consistent viewport behavior
    setupMobileViewport() {
        document.addEventListener(
            "touchstart",
            (e) => {
                if (e.touches.length > 1) e.preventDefault();
            },
            { passive: false }
        );

        let lastTouchEnd = 0;
        document.addEventListener(
            "touchend",
            (e) => {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) e.preventDefault();
                lastTouchEnd = now;
            },
            false
        );

        const viewport = document.querySelector("meta[name='viewport']");
        viewport.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    }

    async init() {
        if (this.isInitialized) return;

        try {
            await this.populateCategories();
            this.setupEventListeners();
            this.setupMobileViewport();
            this.loadUserPreferences();
            this.setDefaultLanguage();
            this.showFlashcard();
            this.isInitialized = true;
        } catch (error) {
            console.error("Failed to initialize app:", error);
            this.showError("Failed to load flashcards");
        }
    }

    populateCategories() {
        return new Promise((resolve) => {
            const categories = Object.keys(flashcards);
            elements.categorySelect.innerHTML = "";

            for (const category of categories) {
                const option = document.createElement("option");
                option.value = category;
                option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
                elements.categorySelect.appendChild(option);
            }

            this.currentCategory = categories[0];
            resolve();
        });
    }

    setupEventListeners() {
        elements.flashcard.addEventListener("click", (e) => this.flipCard(e));

        elements.flashcard.addEventListener(
            "touchstart",
            (e) => {
                this.touchStartX = e.touches[0].clientX;
            },
            { passive: true }
        );

        elements.flashcard.addEventListener(
            "touchend",
            (e) => this.handleTouchEnd(e),
            { passive: true }
        );

        elements.prevBtn.addEventListener("click", () => this.goToPreviousCard());
        elements.nextBtn.addEventListener("click", () => this.goToNextCard());
        elements.playAudioBtn.addEventListener("click", () => this.playCurrentAudio());

        elements.flags.forEach((flag) =>
            flag.addEventListener("click", () => this.changeLanguage(flag.dataset.lang))
        );

        elements.categorySelect.addEventListener("change", (e) => {
            this.currentCategory = e.target.value;
            currentIndex = 0;
            this.imageLoader.clearCache();
            this.showFlashcard();
        });

        elements.darkModeToggle.addEventListener("change", () => this.toggleDarkMode());

        document.addEventListener("keydown", (e) => this.handleKeyboardNavigation(e));
        elements.backBtn.addEventListener("click", () => (window.location.href = "../index.html"));

        // Enable audio after first user interaction
        const enableAudio = () => {
            this.hasUserInteracted = true;
            autoSpeakEnabled = true;
        };
        document.addEventListener("click", enableAudio, { once: true });
        document.addEventListener("touchstart", enableAudio, { once: true });
    }

    changeLanguage(lang) {
        elements.flags.forEach((f) => f.classList.remove("active"));
        const activeFlag = [...elements.flags].find((f) => f.dataset.lang === lang);
        if (activeFlag) activeFlag.classList.add("active");

        currentLang = lang;
        this.showFlashcard();
    }

    setDefaultLanguage() {
        const defaultFlag = document.querySelector(`.language-tab[data-lang="${CONFIG.DEFAULT_LANG}"]`);
        if (defaultFlag) defaultFlag.classList.add("active");
    }

    loadUserPreferences() {
        const darkMode = localStorage.getItem("flashcard_dark") === "true";
        if (darkMode) {
            elements.darkModeToggle.checked = true;
            document.body.classList.add("dark");
        }
    }

    showFlashcard() {
        const cards = flashcards[this.currentCategory];
        const total = cards.length;

        if (!cards || total === 0) return this.showError("No flashcards available");

        const card = cards[currentIndex] || cards[(currentIndex = 0)];

        const word = card.words[currentLang] || card.words.en;
        const englishWord = card.words.en;

        elements.cardWordFront.textContent = word;
        elements.cardWordBack.textContent = englishWord;

        this.loadCardImage(card.img);
        this.updateProgress();
        this.preloadAdjacentImages();
        this.resetCardFlip();

        if (autoSpeakEnabled && this.hasUserInteracted && currentIndex > 0) {
            setTimeout(() => this.speakWord(card.name, word, currentLang), 300);
        }
    }

    async loadCardImage(imageUrl) {
        const word = elements.cardWordFront.textContent;
        elements.cardImage.src =
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23f8f9fa'/><text x='50%' y='50%' font-size='14' fill='%23999' text-anchor='middle' dy='.3em'>Loading...</text></svg>";
        elements.cardImage.alt = `Loading image for ${word}`;

        if (!imageUrl) return this.setFallbackImage();

        try {
            const cachedImage = await this.imageLoader.loadImage(imageUrl);
            elements.cardImage.src = cachedImage.src;
            elements.cardImage.alt = `Image for ${word}`;
        } catch {
            this.setFallbackImage();
        }
    }

    async preloadAdjacentImages() {
        const cards = flashcards[this.currentCategory];
        const total = cards.length;

        for (let i = 1; i <= CONFIG.IMAGE_PRELOAD_COUNT; i++) {
            const next = cards[(currentIndex + i) % total]?.img;
            const prev = cards[(currentIndex - i + total) % total]?.img;

            if (next) this.imageLoader.preloadImage(next);
            if (prev) this.imageLoader.preloadImage(prev);
        }
    }

    setFallbackImage() {
        elements.cardImage.src =
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23f8f9fa'/><text x='50%' y='50%' font-size='12' fill='%23999' text-anchor='middle' dy='.3em'>No Image</text></svg>";
        elements.cardImage.alt = "No image available";
    }

    updateProgress() {
        const cards = flashcards[this.currentCategory];
        elements.progressBar.style.width = `${((currentIndex + 1) / cards.length) * 100}%`;
        elements.progressText.textContent = `${currentIndex + 1} / ${cards.length}`;
    }

    flipCard(e) {
        if (e.target.closest("button") || e.target.closest("select")) return;

        elements.flashcard.classList.toggle("flip");
        isCardFlipped = !isCardFlipped;

        const card = flashcards[this.currentCategory][currentIndex];
        const lang = isCardFlipped ? "en" : currentLang;
        const word = card.words[lang];
        this.speakWord(card.name, word, lang);
    }

    resetCardFlip() {
        elements.flashcard.classList.remove("flip");
        isCardFlipped = false;
    }

    goToPreviousCard() {
        const total = flashcards[this.currentCategory].length;
        currentIndex = (currentIndex - 1 + total) % total;
        this.showFlashcard();
    }

    goToNextCard() {
        const total = flashcards[this.currentCategory].length;
        currentIndex = (currentIndex + 1) % total;
        this.showFlashcard();
    }

    playCurrentAudio() {
        const card = flashcards[this.currentCategory][currentIndex];
        const lang = isCardFlipped ? "en" : currentLang;
        this.speakWord(card.name, card.words[lang], lang);
    }

    handleKeyboardNavigation(event) {
        if (["INPUT", "SELECT"].includes(event.target.tagName)) return;

        const keyMap = {
            ArrowLeft: () => this.goToPreviousCard(),
            ArrowRight: () => this.goToNextCard(),
            " ": () => this.flipCard(event),
            Enter: () => this.flipCard(event),
            p: () => this.playCurrentAudio(),
            P: () => this.playCurrentAudio(),
            r: () => this.resetCardFlip(),
            R: () => this.resetCardFlip(),
        };

        if (keyMap[event.key]) {
            event.preventDefault();
            keyMap[event.key]();
        }
    }

    toggleDarkMode() {
        const isDark = elements.darkModeToggle.checked;
        document.body.classList.toggle("dark", isDark);
        localStorage.setItem("flashcard_dark", isDark);
    }

    // AUDIO
    async speakWord(wordKey, displayWord, language = currentLang) {
        if (!autoSpeakEnabled) return;

        try {
            const audioPath = this.getAudioPath(language, wordKey);
            if (!audioPath) throw new Error("Audio path missing");
            await this.playAudio(audioPath);
        } catch {
            this.fallbackTTS(displayWord, language);
        }
    }

    getAudioPath(lang, wordKey) {
        const folderMap = { da: "danish", fa: "persian", pt: "portuguese", en: "english" };
        const folder = folderMap[lang];

        if (!folder) return null;

        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const ext = isSafari ? CONFIG.AUDIO_FORMATS.safari : CONFIG.AUDIO_FORMATS.default;

        return `audio/${folder}/${wordKey}${ext}`;
    }

    playAudio(path) {
        return new Promise((resolve, reject) => {
            globalAudio.pause();
            globalAudio.currentTime = 0;
            globalAudio.volume = 0.8;
            globalAudio.src = path;

            globalAudio.onended = resolve;
            globalAudio.onerror = reject;

            const playPromise = globalAudio.play();
            if (playPromise) playPromise.catch(reject);
        });
    }

    fallbackTTS(text, lang = currentLang) {
        if (!window.speechSynthesis) return;

        speechSynthesis.cancel();

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = { da: "da-DK", fa: "fa-IR", pt: "pt-PT", en: "en-US" }[lang] || "en-US";
        utter.volume = 1;
        utter.rate = CONFIG.SPEECH_RATE;
        utter.pitch = 1;

        speechSynthesis.speak(utter);
    }

    showError(msg) {
        elements.cardWordFront.textContent = "Error";
        elements.cardWordBack.textContent = msg;
    }

    handleTouchEnd(e) {
        if (!this.touchStartX) return;

        const diff = e.changedTouches[0].clientX - this.touchStartX;
        const threshold = 50;

        if (Math.abs(diff) > threshold) {
            diff > 0 ? this.goToPreviousCard() : this.goToNextCard();
        }

        this.touchStartX = null;
    }
}

// ========== IMAGE LOADER ==========
class ImageLoader {
    constructor() {
        this.cache = new Map();
        this.preloadQueue = new Set();
    }

    loadImage(src) {
        if (this.cache.has(src)) return Promise.resolve(this.cache.get(src));

        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                this.cache.set(src, img);
                resolve(img);
            };

            img.onerror = reject;

            img.src = src;

            setTimeout(() => {
                if (!img.complete) reject(new Error("Image timeout"));
            }, 10000);
        });
    }

    preloadImage(src) {
        if (this.cache.has(src) || this.preloadQueue.has(src)) return;

        this.preloadQueue.add(src);

        const img = new Image();
        img.onload = () => {
            this.cache.set(src, img);
            this.preloadQueue.delete(src);
        };
        img.src = src;
    }

    clearCache() {
        this.cache.clear();
        this.preloadQueue.clear();
    }
}

// ========== INITIALIZE ==========
const app = new FlashcardApp();
document.addEventListener("DOMContentLoaded", () => app.init());

// Unlock audio on first interaction
["click", "touchstart"].forEach((type) => {
    document.addEventListener(
        type,
        () => {
            if (globalAudio.readyState === 0) {
                const silent = new Audio();
                silent.volume = 0.001;
                silent.play().catch(() => {});
            }
        },
        { once: true }
    );
});

// Pause audio/TTS when tab hidden
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        globalAudio.pause();
        speechSynthesis.cancel();
    }
});
