 // ===============================
// STATE PRINCIPAL
// ===============================
let words = [];
let currentWord = "";
let currentCategory = "";
let currentHint = "";
let revealed = [];
let timerInterval;
let timeLeft = 90;
const ROUND_DURATION = 90;

let roundActive = false;

// hint timing
let hintJSONGiven = false;
let hintJSONMoment = null;

let hint2Given = false;
let hint3Given = false;

// scoruri
let dailyScores = {};
let globalScores = {};
let todayDate = getTodayDate();

// ===============================
// PORNIRE JOC
// ===============================
fetch("config.json")
    .then(res => res.json())
    .then(data => {
        words = data;
        loadScores();
        startNewRound();
        connectWebSocket();
    });

// ===============================
// UTILITARE DATA & SCORURI
// ===============================
function getTodayDate() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

function loadScores() {
    try {
        const daily = localStorage.getItem("maskDailyScores");
        const global = localStorage.getItem("maskGlobalScores");
        const savedDate = localStorage.getItem("maskDailyDate");

        dailyScores = daily ? JSON.parse(daily) : {};
        globalScores = global ? JSON.parse(global) : {};

        if (!savedDate || savedDate !== todayDate) {
            dailyScores = {};
            localStorage.setItem("maskDailyDate", todayDate);
            saveDailyScores();
        }
    } catch {
        dailyScores = {};
        globalScores = {};
    }
    updateTicker();
}

function saveDailyScores() {
    localStorage.setItem("maskDailyScores", JSON.stringify(dailyScores));
}

function saveGlobalScores() {
    localStorage.setItem("maskGlobalScores", JSON.stringify(globalScores));
}

function addPoints(nickname, points) {
    if (!dailyScores[nickname]) dailyScores[nickname] = 0;
    if (!globalScores[nickname]) globalScores[nickname] = 0;

    dailyScores[nickname] += points;
    globalScores[nickname] += points;

    saveDailyScores();
    saveGlobalScores();
    updateTicker();
}

// ===============================
// RUNDĂ NOUĂ
// ===============================
function startNewRound() {
    roundActive = true;
    timeLeft = ROUND_DURATION;

    hintJSONGiven = false;
    hintJSONMoment = randomInt(15, 20);

    hint2Given = false;
    hint3Given = false;

    const random = words[Math.floor(Math.random() * words.length)];

    currentWord = random.word.toLowerCase();
    currentCategory = random.category;
    currentHint = random.hint || "";

    const parts = currentWord.split(" ");
    revealed = parts.map(part => Array(part.length).fill("_"));

    document.getElementById("category").innerText = currentCategory;
    document.getElementById("hint").innerText = "";

    updateWordDisplay();
    updateStatus("");

    startTimer();
}

// ===============================
// TIMER
// ===============================
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft < 0) timeLeft = 0;

        updateTimerDisplay();

        const elapsed = ROUND_DURATION - timeLeft;

        if (!hintJSONGiven && timeLeft <= hintJSONMoment) {
            hintJSONGiven = true;
            document.getElementById("hint").innerText = currentHint;
            applyNeonColors();
        }

        if (!hint2Given && elapsed >= 60) {
            giveHint2();
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            roundActive = false;
            revealFullWord();
            updateStatus("Timpul a expirat!");
            setTimeout(startNewRound, 5000);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const text = document.getElementById("timer-text");
    const bar = document.getElementById("timer-bar");

    if (!text || !bar) return;

    text.innerText = timeLeft;

    const circumference = 2 * Math.PI * 50;
    const progress = timeLeft / ROUND_DURATION;
    bar.style.strokeDasharray = circumference;
    bar.style.strokeDashoffset = circumference * (1 - progress);
}

// ===============================
// INDICII
// ===============================
function giveHint2() {
    hint2Given = true;

    const parts = currentWord.split(" ");
    for (let p = 0; p < parts.length; p++) {
        const word = parts[p];
        const lastIndex = word.length - 1;
        revealed[p][lastIndex] = word[lastIndex];
    }

    updateWordDisplay();
    applyNeonColors();
}

// ===============================
// AFIȘARE CUVÂNT
// ===============================
function updateWordDisplay() {
    const container = document.getElementById("word-container");
    container.innerHTML = "";

    revealed.forEach(wordArr => {
        const wordBlock = document.createElement("div");
        wordBlock.className = "word-block";

        wordArr.forEach(letter => {
            const box = document.createElement("span");
            box.className = "letter-box";
            box.innerText = letter;
            wordBlock.appendChild(box);
        });

        container.appendChild(wordBlock);
    });
}

// ===============================
// REVELARE CUVÂNT
// ===============================
function revealFullWord() {
    const parts = currentWord.split(" ");
    revealed = parts.map(part => part.split(""));
    updateWordDisplay();
    applyNeonColors();
}

// ===============================
// STATUS
// ===============================
function updateStatus(msg) {
    const el = document.getElementById("status");
    if (el) el.innerText = msg;
}

// ===============================
// WEBSOCKET
// ===============================
function connectWebSocket() {
    const socket = new WebSocket("ws://localhost:21213/");

    socket.onmessage = (event) => {
        try {
            const json = JSON.parse(event.data);

            if (json.event === "chat") {
                const nickname = json.data.nickname;
                const message = json.data.comment;

                handleChatMessage(nickname, message);
            }
        } catch {}
    };

    socket.onclose = () => setTimeout(connectWebSocket, 2000);
}

// ===============================
// CHAT
// ===============================
function handleChatMessage(nickname, message) {
    if (!message.startsWith("#")) return;
    const cmd = message.trim().toLowerCase();

    if (cmd === "#global") return showGlobalLeaderboard();
    if (cmd === "#scor") return showPlayerScore(nickname);

    if (!roundActive) return;

    let guess = message.substring(1).trim().toLowerCase();
    if (!guess) return;

    const normalizedWord = currentWord;

    if (guess === normalizedWord) return handleCorrectGuess(nickname);

    const firstWord = normalizedWord.split(" ")[0];
    if (guess.length >= 3 && firstWord.startsWith(guess))
        return handleCorrectGuess(nickname, true);
}

// ===============================
// GHICIRE
// ===============================
function handleCorrectGuess(nickname, partial = false) {
    if (!roundActive) return;

    roundActive = false;
    clearInterval(timerInterval);

    const elapsed = ROUND_DURATION - timeLeft;
    let points = 5;

    if (!hint2Given || elapsed < 60) points = 10;

    addPoints(nickname, points);

    revealFullWord();

    updateStatus(
        partial
            ? `${nickname} a ghicit parțial (+${points}p)`
            : `${nickname} a ghicit cuvântul! (+${points}p)`
    );

    setTimeout(() => {
        startNewRound();
    }, 5000);
}

// ===============================
// CLASAMENTE
// ===============================
function showGlobalLeaderboard() {
    const entries = Object.entries(globalScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    let text = "GLOBAL:\n";
    entries.forEach(([name, score], i) => {
        text += `${i + 1}. ${name} — ${score}p\n`;
    });

    updateStatus(text);
}

function showPlayerScore(nickname) {
    const entries = Object.entries(globalScores)
        .sort((a, b) => b[1] - a[1]);

    const idx = entries.findIndex(([name]) => name === nickname);

    if (idx === -1) return updateStatus(`${nickname} nu are puncte.`);

    const score = entries[idx][1];
    const position = idx + 1;

    updateStatus(`${nickname}: locul ${position}, ${score}p`);
}

// ===============================
// TICKER
// ===============================
function updateTicker() {
    const ticker = document.getElementById("ticker");
    if (!ticker) return;

    const entries = Object.entries(dailyScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (entries.length === 0) {
        ticker.innerHTML = "<span>TOP ZILNIC: încă nu există puncte.</span>";
        return;
    }

    let parts = entries.map(([name, score], i) => `${i + 1}. ${name} — ${score}p`);
    ticker.innerHTML = "<span>TOP ZILNIC: " + parts.join(" | ") + "</span>";
}

// ===============================
// UTILITARE
// ===============================
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===============================
// NEON RANDOM
// ===============================
function randomNeonColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 100%, 55%)`;
}

function applyNeonColors() {
    const elements = {
        signature: document.getElementById("signature"),
        category: document.getElementById("category"),
        timerText: document.getElementById("timer-text"),
        status: document.getElementById("status"),
        ticker: document.getElementById("ticker"),
        hint: document.getElementById("hint")
    };

    const timerBar = document.getElementById("timer-bar");

    const usedColors = [];

    function getUniqueColor() {
        let c;
        do {
            c = randomNeonColor();
        } while (usedColors.includes(c));
        usedColors.push(c);
        return c;
    }

    Object.values(elements).forEach(el => {
        if (el) el.style.color = getUniqueColor();
    });

    if (timerBar) {
        timerBar.style.stroke = getUniqueColor();
    }

    document.querySelectorAll(".letter-box").forEach(box => {
        const c = getUniqueColor();
        box.style.color = c;
        box.style.borderColor = c;
        box.style.boxShadow = `0 0 12px ${c}`;
    });
}

// ===============================
// SUPRASCRIERE RUNDĂ
// ===============================
const originalStartNewRound = startNewRound;
startNewRound = function () {
    originalStartNewRound();
    setTimeout(applyNeonColors, 50);
};