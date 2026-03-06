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
        connectWebSocket(); // ← AICI TREBUIE SĂ FIE
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
}

// ===============================
// RUNDĂ NOUĂ
// ===============================
function startNewRound() {
    roundActive = true;
    timeLeft = ROUND_DURATION;

    hintJSONGiven = false;
    hintJSONMoment = randomInt(22, 28);

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

            const h = document.getElementById("hint");
            h.style.color = "#ffffff";
            h.style.fontWeight = "900";
            h.style.textShadow = "0 0 10px #fff";
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
}

// ===============================
// STATUS
// ===============================
function updateStatus(msg) {
    const el = document.getElementById("status");
    if (el) {
        el.innerText = msg;
        el.style.color = "#ffffff";
        el.style.fontWeight = "900";
        el.style.textShadow = "0 0 10px #fff";
    }
}

// ===============================
// WEBSOCKET — EXACT UNDE ERA LA TINE
// ===============================
function connectWebSocket() {
    const socket = new WebSocket("ws://localhost:62024");

    socket.onopen = () => console.log("Conectat la Indofinity!");

    socket.onmessage = (event) => {
        try {
            const packet = JSON.parse(event.data);

            if (packet.event === "chat") {
                const nickname =
                    packet.data.nickname ||
                    packet.data.uniqueId ||
                    packet.data.displayName ||
                    packet.data.username ||
                    "necunoscut";

                const message = packet.data.comment || "";

                handleChatMessage(nickname, message);
            }
        } catch (err) {
            console.error("Eroare WS:", err);
        }
    };

    socket.onclose = () => {
        console.log("WS închis, reconectare...");
        setTimeout(connectWebSocket, 2000);
    };
}

// ===============================
// CHAT
// ===============================
function handleChatMessage(nickname, message) {
    const msg = message.trim().toLowerCase();

    if (msg.startsWith(".")) {
        const cmd = msg.substring(1);

        if (cmd === "global") return showGlobalLeaderboard();
        if (cmd === "scor")   return showPlayerScore(nickname);
        if (cmd === "top")    return showDailyTop();

        return;
    }

    if (!roundActive) return;

    const guess = msg;
    if (!guess) return;

    const normalizedWord = currentWord;

    if (guess === normalizedWord) {
        return handleCorrectGuess(nickname);
    }
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

    if (idx === -1) {
        updateStatus(`${nickname} nu are puncte.`);
        return;
    }

    const score = entries[idx][1];
    const position = idx + 1;

    updateStatus(`${nickname}: locul ${position}, ${score}p`);
}

function showDailyTop() {
    const entries = Object.entries(dailyScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    let text = "TOP ZILNIC:\n";
    entries.forEach(([name, score], i) => {
        text += `${i + 1}. ${name} — ${score}p\n`;
    });

    updateStatus(text);
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
        status: document.getElementById("status")
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
// SUPRASCRIERE RUNDĂ — ULTIMUL
// ===============================
const originalStartNewRound = startNewRound;
startNewRound = function () {
    originalStartNewRound();
    setTimeout(applyNeonColors, 50);
}; 
