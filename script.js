"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const state = {
    activeMode: "countdown",
    countdownSource: "duration",
    countdownInterval: null,
    countdownRunning: false,
    countdownRemaining: 0,
    countdownConfiguredDuration: 0,
    countdownEndAt: 0,
    countdownLastTickSecond: null,
    countdownCompleted: false,
    countdownResetLocked: false,
    countdownPaused: false,
    stopwatchInterval: null,
    stopwatchRunning: false,
    stopwatchElapsed: 0,
    stopwatchStartedAt: 0,
    stopwatchLimit: 0,
    stopwatchLastTickSecond: null,
    stopwatchCompleted: false,
    clockInterval: null,
    clock24Hour: false,
    theme: "slate",
    celebrationSound: "techno",
    studentIntroEnabled: false,
    participantQueueEnabled: false,
    studentName: "Student",
    participantNames: [],
    nextParticipantIndex: 0,
    pendingStartMode: null,
    introGeneration: 0,
    introTimeout: null,
    audioContext: null,
    confettiFrame: null
  };

  const modeNames = { countdown: "Countdown", stopwatch: "Stopwatch", clock: "Local time" };
  const modeDescriptions = {
    countdown: "A moment worth counting down to.",
    stopwatch: "Every second, precisely measured.",
    clock: "Your local time, at a glance."
  };
  const themes = ["slate", "navy", "maroon"];
  const digitLayouts = {
    countdown: [
      ["hours", "Hours"], ["minutes", "Minutes"], ["seconds", "Seconds"]
    ],
    stopwatch: [
      ["stopwatch-hours", "Hours"], ["stopwatch-minutes", "Minutes"], ["stopwatch-seconds", "Seconds"]
    ]
  };

  function pad(value, width = 2) {
    return String(value).padStart(width, "0");
  }

  function generateDigitGrid(container, layout, accessibleName) {
    container.replaceChildren();
    container.setAttribute("aria-label", accessibleName);
    layout.forEach(([id, label], index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "separator";
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = ":";
        container.append(separator);
      }
      const unit = document.createElement("div");
      unit.className = "time-unit";
      const card = document.createElement("div");
      card.className = "digit-card";
      const digit = document.createElement("span");
      digit.className = "digit";
      digit.id = id;
      digit.textContent = "00";
      const unitLabel = document.createElement("span");
      unitLabel.className = "unit-label";
      unitLabel.textContent = label;
      card.append(digit);
      unit.append(card, unitLabel);
      container.append(unit);
    });
  }

  function createDefaultTarget() {
    const target = new Date(Date.now() + 10 * 60 * 1000);
    target.setSeconds(0, 0);
    const localTarget = new Date(target.getTime() - target.getTimezoneOffset() * 60000);
    return localTarget.toISOString().slice(0, 16);
  }

  function readTarget() {
    const value = $("#target-date").value;
    if (!value) return NaN;
    return new Date(value).getTime();
  }

  function readDuration() {
    const fields = [
      $("#duration-days"), $("#duration-hours"), $("#duration-minutes"), $("#duration-seconds")
    ];
    const values = fields.map((field) => field.valueAsNumber);
    const limits = [999, 23, 59, 59];
    if (values.some((value, index) => !Number.isInteger(value) || value < 0 || value > limits[index])) return NaN;
    return (((values[0] * 24 + values[1]) * 60 + values[2]) * 60 + values[3]) * 1000;
  }

  function readStopwatchLimit() {
    const fields = [
      $("#stopwatch-limit-hours"), $("#stopwatch-limit-minutes"), $("#stopwatch-limit-seconds")
    ];
    const values = fields.map((field) => field.valueAsNumber);
    const limits = [999, 59, 59];
    if (values.some((value, index) => !Number.isInteger(value) || value < 0 || value > limits[index])) return NaN;
    return ((values[0] * 60 + values[1]) * 60 + values[2]) * 1000;
  }

  function writeCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    $("#hours").textContent = pad(Math.floor(totalSeconds / 3600));
    $("#minutes").textContent = pad(Math.floor(totalSeconds / 60) % 60);
    $("#seconds").textContent = pad(totalSeconds % 60);
  }

  function setCountdownButton(running) {
    const button = $("#countdown-toggle");
    button.querySelector("span").textContent = running ? "Pause" : (state.countdownRemaining > 0 && !state.countdownCompleted ? "Resume" : "Start");
    button.querySelector("svg").innerHTML = running
      ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
      : '<path d="m8 5 11 7-11 7z"/>';
  }

  function setStopwatchButton(running) {
    const button = $("#stopwatch-toggle");
    button.querySelector("span").textContent = running ? "Pause" : (
      state.stopwatchCompleted ? "Start again" : state.stopwatchElapsed > 0 ? "Resume" : "Start"
    );
    button.querySelector("svg").innerHTML = running
      ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
      : '<path d="m8 5 11 7-11 7z"/>';
  }

  function setStatus(element, message, complete = false) {
    element.textContent = message;
    element.classList.toggle("complete", complete);
  }

  function setParticipantQueueStatus(message, complete = false) {
    document.querySelectorAll(".participant-queue-status")
      .forEach((element) => setStatus(element, message, complete));
  }

  function setParticipantQueueVisible(visible) {
    document.querySelectorAll(".participant-queue-controls")
      .forEach((panel) => { panel.hidden = !visible; });
  }

  function applySelectedCountdown() {
    const selected = state.countdownSource === "target"
      ? readTarget() - Date.now()
      : readDuration();
    if (!Number.isFinite(selected) || selected <= 0) return false;
    state.countdownRemaining = selected;
    state.countdownConfiguredDuration = selected;
    state.countdownResetLocked = false;
    state.countdownCompleted = false;
    state.countdownPaused = false;
    writeCountdown(selected);
    setCountdownButton(false);
    setStatus($("#countdown-status"), "Time set. Press Start when ready.");
    return true;
  }

  function pauseCountdown({ completed = false, celebrate = false } = {}) {
    if (state.countdownRunning) {
      state.countdownRemaining = Math.max(0, state.countdownEndAt - Date.now());
    }
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
    state.countdownRunning = false;
    state.countdownPaused = !completed;
    if (completed) {
      state.countdownRemaining = 0;
      state.countdownCompleted = true;
    }
    writeCountdown(state.countdownRemaining);
    setCountdownButton(false);
    setStatus($("#countdown-status"), completed ? "Time is up — well done!" : "Countdown paused.", completed);
    if (completed || celebrate) celebrateNow();
  }

  function completeCountdown() {
    if (state.countdownCompleted) return;
    pauseCountdown({ completed: true, celebrate: true });
  }

  function tickCountdown() {
    state.countdownRemaining = Math.max(0, state.countdownEndAt - Date.now());
    writeCountdown(state.countdownRemaining);
    const secondsRemaining = Math.ceil(state.countdownRemaining / 1000);
    if (secondsRemaining >= 1 && secondsRemaining <= 3 && secondsRemaining !== state.countdownLastTickSecond) {
      state.countdownLastTickSecond = secondsRemaining;
      playFinalSecondsTick();
    }
    if (state.countdownRemaining <= 0) completeCountdown();
  }

  function startCountdown() {
    if (state.countdownRunning) {
      if (state.countdownEndAt <= Date.now()) completeCountdown();
      else pauseCountdown({ celebrate: true });
      return;
    }

    if (state.countdownCompleted && state.countdownConfiguredDuration > 0) {
      state.countdownSource = "duration";
      state.countdownRemaining = state.countdownConfiguredDuration;
    } else if (state.countdownSource === "target" && !state.countdownPaused && !state.countdownCompleted && !state.countdownResetLocked) {
      state.countdownRemaining = Math.max(0, readTarget() - Date.now());
    } else if (state.countdownRemaining <= 0 || state.countdownCompleted || state.countdownResetLocked) {
      if (!applySelectedCountdown()) {
        state.countdownRemaining = 0;
        writeCountdown(0);
        setCountdownButton(false);
        setStatus($("#countdown-status"), state.countdownSource === "target"
          ? "Choose a future target date and time."
          : "Set a valid duration greater than zero.");
        return;
      }
    }

    if (state.countdownRemaining <= 0) {
      completeCountdown();
      return;
    }
    prepareAudio();
    if (!state.countdownPaused) state.countdownConfiguredDuration = state.countdownRemaining;
    state.countdownLastTickSecond = null;
    playTimerStartSound();
    state.countdownEndAt = Date.now() + state.countdownRemaining;
    state.countdownRunning = true;
    state.countdownPaused = false;
    setCountdownButton(true);
    setStatus($("#countdown-status"), "Countdown in progress.");
    state.countdownInterval = window.setInterval(tickCountdown, 80);
    tickCountdown();
  }

  function renderStopwatch(elapsed = state.stopwatchElapsed + (state.stopwatchRunning ? performance.now() - state.stopwatchStartedAt : 0)) {
    const milliseconds = Math.floor(elapsed);
    $("#stopwatch-hours").textContent = pad(Math.floor(milliseconds / 3600000));
    $("#stopwatch-minutes").textContent = pad(Math.floor(milliseconds / 60000));
    $("#stopwatch-seconds").textContent = pad(Math.floor(milliseconds / 1000) % 60);
  }

  function tickStopwatch() {
    const elapsed = state.stopwatchElapsed + performance.now() - state.stopwatchStartedAt;
    if (state.stopwatchLimit > 0) {
      const remaining = Math.max(0, state.stopwatchLimit - elapsed);
      const secondsRemaining = Math.ceil(remaining / 1000);
      if (secondsRemaining >= 1 && secondsRemaining <= 3 && secondsRemaining !== state.stopwatchLastTickSecond) {
        state.stopwatchLastTickSecond = secondsRemaining;
        playFinalSecondsTick();
      }
      if (remaining <= 0) {
        state.stopwatchElapsed = state.stopwatchLimit;
        renderStopwatch(state.stopwatchElapsed);
        state.stopwatchRunning = false;
        state.stopwatchCompleted = true;
        clearInterval(state.stopwatchInterval);
        state.stopwatchInterval = null;
        setStopwatchButton(false);
        setStatus($("#stopwatch-status"), "Time limit reached.", true);
        celebrateNow();
        return;
      }
    }
    renderStopwatch(elapsed);
  }

  function startStopwatch() {
    if (state.stopwatchRunning) return;
    if (state.stopwatchCompleted) {
      state.stopwatchElapsed = 0;
      state.stopwatchCompleted = false;
      renderStopwatch();
    }
    prepareAudio();
    state.stopwatchLastTickSecond = null;
    playTimerStartSound();
    state.stopwatchRunning = true;
    state.stopwatchStartedAt = performance.now();
    state.stopwatchInterval = window.setInterval(tickStopwatch, 10);
    setStopwatchButton(true);
    setStatus($("#stopwatch-status"), "Stopwatch running.");
    tickStopwatch();
  }

  function pauseStopwatch() {
    state.stopwatchElapsed += performance.now() - state.stopwatchStartedAt;
    state.stopwatchRunning = false;
    clearInterval(state.stopwatchInterval);
    state.stopwatchInterval = null;
    setStopwatchButton(false);
    setStatus($("#stopwatch-status"), "Stopwatch paused.");
    renderStopwatch();
    celebrateNow();
  }

  function stopOtherTimer(mode) {
    if (mode !== "countdown" && state.countdownRunning) {
      state.countdownRemaining = Math.max(0, state.countdownEndAt - Date.now());
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
      state.countdownRunning = false;
      state.countdownPaused = true;
      writeCountdown(state.countdownRemaining);
      setCountdownButton(false);
      setStatus($("#countdown-status"), "Countdown paused.");
    }
    if (mode !== "stopwatch" && state.stopwatchRunning) {
      state.stopwatchElapsed += performance.now() - state.stopwatchStartedAt;
      state.stopwatchRunning = false;
      clearInterval(state.stopwatchInterval);
      state.stopwatchInterval = null;
      setStopwatchButton(false);
      setStatus($("#stopwatch-status"), "Stopwatch paused.");
      renderStopwatch();
    }
  }

  function cancelIntro({ hide = true } = {}) {
    state.introGeneration += 1;
    clearTimeout(state.introTimeout);
    state.introTimeout = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.pendingStartMode = null;
    document.querySelectorAll("[data-participant-welcome]")
      .forEach((button) => { button.disabled = false; });
    const overlay = $("#student-intro");
    overlay.classList.remove("active");
    overlay.classList.add("leaving");
    overlay.setAttribute("aria-hidden", "true");
    if (hide) {
      state.introTimeout = window.setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove("leaving");
        state.introTimeout = null;
      }, 400);
    }
  }

  function resetAllTimers() {
    cancelIntro();
    clearInterval(state.countdownInterval);
    clearInterval(state.stopwatchInterval);
    state.countdownInterval = null;
    state.stopwatchInterval = null;
    state.countdownRunning = false;
    state.countdownRemaining = 0;
    state.countdownConfiguredDuration = 0;
    state.countdownEndAt = 0;
    state.countdownCompleted = false;
    state.countdownPaused = false;
    state.nextParticipantIndex = 0;
    state.countdownResetLocked = true;
    state.countdownSource = "duration";
    state.stopwatchRunning = false;
    state.stopwatchElapsed = 0;
    state.stopwatchStartedAt = 0;
    state.stopwatchLimit = 0;
    state.stopwatchLastTickSecond = null;
    state.stopwatchCompleted = false;
    ["#duration-days", "#duration-hours", "#duration-minutes", "#duration-seconds"].forEach((selector) => {
      $(selector).value = "0";
    });
    ["#stopwatch-limit-hours", "#stopwatch-limit-minutes", "#stopwatch-limit-seconds"].forEach((selector) => {
      $(selector).value = "0";
    });
    $("#target-date").value = "";
    writeCountdown(0);
    renderStopwatch();
    setCountdownButton(false);
    setStopwatchButton(false);
    setStatus($("#countdown-status"), "Reset to 00. Set a new time before starting.");
    setStatus($("#stopwatch-status"), "Stopwatch reset to 00.");
  }

  function speak(text, { fallbackWord = "Go", rate = 1 } = {}) {
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      playIntroTone(fallbackWord);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = rate;
      utterance.pitch = 1;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        resolve();
      };
      const fallbackTimer = window.setTimeout(() => {
        console.error(`Speech synthesis timed out for: "${text}"`);
        window.speechSynthesis.cancel();
        playIntroTone(fallbackWord);
        settle();
      }, 15000);
      utterance.onend = settle;
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          console.error("Speech synthesis failed:", event.error);
          playIntroTone(fallbackWord);
        }
        settle();
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error("Unable to speak the student introduction:", error);
        playIntroTone(fallbackWord);
        settle();
      }
    });
  }

  function playIntroTone(word) {
    if (!state.audioContext || state.audioContext.state !== "running") return;
    const frequencies = { Three: 523.25, Two: 659.25, One: 783.99, Go: 1046.5 };
    const frequency = frequencies[word] || 660;
    scheduleTone(state.audioContext, frequency, state.audioContext.currentTime + .015, .22, {
      type: "triangle", volume: .14, endFrequency: frequency * 1.04
    });
  }

  async function runStudentIntro(mode) {
    if (state.pendingStartMode) return;
    clearTimeout(state.introTimeout);
    state.introTimeout = null;
    state.pendingStartMode = mode;
    const generation = ++state.introGeneration;
    const overlay = $("#student-intro");
    const studentName = state.studentName.trim() || "Student";
    $("#intro-greeting").textContent = "Good Luck,";
    $("#intro-student-name").textContent = studentName;
    $("#intro-closing").textContent = "!";
    $("#intro-farewell").textContent = "Let's Go!";
    $("#intro-count").textContent = "";
    $("#intro-count").hidden = false;
    $("#intro-count").classList.remove("counting");
    overlay.hidden = false;
    overlay.classList.remove("leaving");
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => overlay.classList.add("active"));

    prepareAudio();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (state.studentIntroEnabled) {
      await speak(`Good luck, ${studentName}!`, { fallbackWord: "Go", rate: .94 });
      if (generation !== state.introGeneration) return;
    }
    await speak("Let's go!", { fallbackWord: "Go", rate: .94 });
    if (generation !== state.introGeneration) return;

    const showCount = (label) => {
      const counter = $("#intro-count");
      counter.textContent = label;
      counter.classList.remove("counting");
      void counter.offsetWidth;
      counter.classList.add("counting");
    };
    for (const [label, word] of [["3", "Three"], ["2", "Two"], ["1", "One"], ["GO!", "Go"]]) {
      if (generation !== state.introGeneration) return;
      showCount(label);
      const stepStart = performance.now();
      await speak(word, { fallbackWord: word, rate: 1.05 });
      if (generation !== state.introGeneration) return;
      if (word !== "Go") await delay(Math.max(0, 900 - (performance.now() - stepStart)));
    }

    if (generation !== state.introGeneration) return;
    overlay.classList.remove("active");
    overlay.classList.add("leaving");
    overlay.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    overlay.classList.remove("leaving");
    state.pendingStartMode = null;
    startSelectedTimer(mode);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function welcomeNextParticipant() {
    if (state.pendingStartMode || !state.participantQueueEnabled) return;
    if (state.participantNames.length === 0) {
      setParticipantQueueStatus("Add participant names in Settings first.");
      return;
    }
    state.pendingStartMode = "participant-welcome";
    const generation = ++state.introGeneration;
    const overlay = $("#student-intro");
    const participantName = state.participantNames[state.nextParticipantIndex % state.participantNames.length];
    const welcomeButtons = document.querySelectorAll("[data-participant-welcome]");
    welcomeButtons.forEach((button) => { button.disabled = true; });
    setParticipantQueueStatus(`Welcoming ${participantName}…`);
    $("#intro-greeting").textContent = "Please Welcome,";
    $("#intro-student-name").textContent = participantName;
    $("#intro-closing").textContent = "";
    $("#intro-farewell").textContent = "";
    $("#intro-count").textContent = "";
    $("#intro-count").hidden = true;
    $("#intro-count").classList.remove("counting");
    overlay.hidden = false;
    overlay.classList.remove("leaving");
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => overlay.classList.add("active"));

    prepareAudio();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      await speak(`Please welcome, ${participantName}!`, { fallbackWord: "Go", rate: .94 });
      if (generation !== state.introGeneration) return;

      state.nextParticipantIndex = (state.nextParticipantIndex + 1) % state.participantNames.length;
      const nextName = state.participantNames[state.nextParticipantIndex];
      setParticipantQueueStatus(`Welcomed ${participantName}. Next: ${nextName}.`, true);
      await delay(700);
      if (generation !== state.introGeneration) return;
      overlay.classList.remove("active");
      overlay.classList.add("leaving");
      overlay.setAttribute("aria-hidden", "true");
      overlay.hidden = true;
      overlay.classList.remove("leaving");
    } catch (error) {
      console.error("Unable to welcome the next participant:", error);
      setParticipantQueueStatus("Unable to welcome this participant. Please try again.");
    } finally {
      if (generation === state.introGeneration) {
        state.pendingStartMode = null;
        welcomeButtons.forEach((button) => { button.disabled = false; });
      }
    }
  }

  function startSelectedTimer(mode) {
    stopOtherTimer(mode);
    if (mode === "countdown") startCountdown();
    if (mode === "stopwatch") startStopwatch();
  }

  function triggerMainProcess(mode) {
    if (state.pendingStartMode) return;
    if (mode === "countdown" && state.countdownPaused) {
      startSelectedTimer(mode);
      return;
    }
    if (state.studentIntroEnabled) runStudentIntro(mode);
    else startSelectedTimer(mode);
  }

  function renderClock() {
    const now = new Date();
    $("#clock-display").textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: !state.clock24Hour
    }).format(now);
    $("#date-display").textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    }).format(now);
  }

  function switchMode(mode) {
    cancelIntro();
    stopOtherTimer(mode);
    state.activeMode = mode;
    Object.entries({ countdown: "#countdown-panel", stopwatch: "#stopwatch-panel", clock: "#clock-panel" })
      .forEach(([key, selector]) => $(selector).classList.toggle("hidden", key !== mode));
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    $("#mode-eyebrow").textContent = modeNames[mode];
    $("#event-subtitle").textContent = modeDescriptions[mode];
    if (mode === "clock") renderClock();
  }

  function prepareAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API is unavailable.");
      if (!state.audioContext || state.audioContext.state === "closed") state.audioContext = new AudioContextClass();
      if (state.audioContext.state === "suspended") {
        state.audioContext.resume().catch((error) => console.error("Unable to enable audio:", error));
      }
    } catch (error) {
      console.error("Unable to prepare audio:", error);
    }
  }

  function playTimerStartSound() {
    try {
      const context = state.audioContext;
      if (!context) throw new Error("Audio could not be initialized.");
      const play = () => {
        const now = context.currentTime + .02;
        scheduleTone(context, 660, now, .12, { type: "triangle", volume: .32 });
        scheduleTone(context, 880, now + .14, .18, { type: "triangle", volume: .32 });
      };
      if (context.state === "suspended") {
        context.resume().then(play).catch((error) => console.error("Unable to play timer start sound:", error));
      } else {
        play();
      }
    } catch (error) {
      console.error("Unable to play timer start sound:", error);
    }
  }

  function playFinalSecondsTick() {
    try {
      const context = state.audioContext;
      if (!context) throw new Error("Audio could not be initialized.");
      const play = () => {
        const now = context.currentTime + .015;
        scheduleTone(context, 920, now, .055, { type: "square", volume: .2 });
        scheduleTone(context, 760, now + .075, .055, { type: "square", volume: .2 });
      };
      if (context.state === "suspended") {
        context.resume().then(play).catch((error) => console.error("Unable to play final-seconds tick:", error));
      } else {
        play();
      }
    } catch (error) {
      console.error("Unable to play final-seconds tick:", error);
    }
  }

  function scheduleTone(context, frequency, start, duration, {
    type = "sine", volume = .12, endFrequency = frequency, pan = 0
  } = {}) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    panner.pan.value = pan;
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .01);
  }

  function scheduleNoise(context, start, duration, { volume = .12, lowpass = 7000, highpass = 200 } = {}) {
    const sampleCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const high = context.createBiquadFilter();
    const low = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    high.type = "highpass";
    high.frequency.value = highpass;
    low.type = "lowpass";
    low.frequency.value = lowpass;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(high);
    high.connect(low);
    low.connect(gain);
    gain.connect(context.destination);
    source.start(start);
    source.stop(start + duration + .01);
  }

  function playCelebrationSound() {
    try {
      prepareAudio();
      const context = state.audioContext;
      if (!context) throw new Error("Audio could not be initialized.");
      const play = () => {
        const now = context.currentTime + .03;
        if (state.celebrationSound === "8bit") {
          [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
            scheduleTone(context, frequency, now + index * .105, .24, {
              type: "square", volume: .075, endFrequency: frequency, pan: Math.sin(index * .8) * .65
            });
          });
        } else if (state.celebrationSound === "cinematic") {
          scheduleTone(context, 110, now, 1.35, { type: "sine", volume: .32, endFrequency: 32 });
          scheduleTone(context, 55, now + .02, 1.1, { type: "triangle", volume: .25, endFrequency: 27 });
          [130.81, 164.81, 196, 261.63].forEach((frequency, index) => {
            scheduleTone(context, frequency, now + .08, 1.15, {
              type: "sawtooth", volume: .055, endFrequency: frequency * .94, pan: (index - 1.5) * .3
            });
          });
          scheduleNoise(context, now + .04, .95, { volume: .18, lowpass: 1700, highpass: 35 });
        } else {
          scheduleNoise(context, now, .48, { volume: .11, lowpass: 7200, highpass: 220 });
          [0, .14, .28, .56, .7].forEach((offset, index) => {
            const frequency = index % 2 ? 660 : 990;
            scheduleTone(context, frequency, now + offset, .11, {
              type: "sawtooth", volume: .095, endFrequency: frequency * .82
            });
          });
          [0, .42, .84].forEach((offset) => {
            scheduleTone(context, 82.41, now + offset, .18, {
              type: "triangle", volume: .16, endFrequency: 55
            });
          });
        }
      };
      if (context.state === "suspended") {
        context.resume().then(play).catch((error) => console.error("Unable to play celebration sound:", error));
      } else {
        play();
      }
    } catch (error) {
      console.error("Unable to play celebration sound:", error);
    }
  }

  function celebrateNow() {
    launchConfetti();
    playCelebrationSound();
  }

  function launchConfetti() {
    const canvas = $("#confetti-canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      console.error("Canvas rendering is unavailable; celebration animation was skipped.");
      return;
    }
    if (state.confettiFrame) cancelAnimationFrame(state.confettiFrame);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const colors = ["#51d9e9", "#f3c969", "#ff7883", "#a9f4d0", "#c6a8ff", "#ffffff"];
    const pieces = Array.from({ length: 180 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * .65,
      size: 4 + Math.random() * 7,
      speed: 2.3 + Math.random() * 4.8,
      drift: (Math.random() - .5) * 2.4,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - .5) * .18,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const started = performance.now();
    const frame = (time) => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const progress = time - started;
      pieces.forEach((piece) => {
        piece.y += piece.speed;
        piece.x += piece.drift + Math.sin(progress / 350 + piece.angle) * .7;
        piece.angle += piece.spin;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * .62);
        context.restore();
      });
      if (progress < 5200) state.confettiFrame = requestAnimationFrame(frame);
      else {
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
        state.confettiFrame = null;
      }
    };
    state.confettiFrame = requestAnimationFrame(frame);
  }

  function setAnnouncement(message) {
    const track = $("#announcement-track");
    track.replaceChildren();
    [false, true].forEach((duplicate) => {
      const copy = document.createElement("span");
      copy.textContent = `${message}  •  `;
      if (duplicate) copy.setAttribute("aria-hidden", "true");
      track.append(copy);
    });
  }

  function openSettings() {
    $("#title-input").value = $("#event-title").textContent;
    $("#announcement-input").value = $("#announcement-track").firstElementChild.textContent.trim().replace(/\s*•\s*$/, "");
    $("#celebration-sound").value = state.celebrationSound;
    $("#student-intro-toggle").checked = state.studentIntroEnabled;
    $("#participant-queue-toggle").checked = state.participantQueueEnabled;
    setParticipantQueueVisible(state.participantQueueEnabled);
    $("#student-name-input").value = state.studentName;
    $("#participant-names-input").value = state.participantNames.join("\n");
    if (state.participantNames.length === 0 && state.participantQueueEnabled) {
      setParticipantQueueStatus("Add participant names in Settings first.");
    }
    $("#settings-modal").hidden = false;
    $("#title-input").focus();
  }

  function closeSettings() {
    $("#settings-modal").hidden = true;
    $("#settings-button").focus();
  }

  function saveSettings() {
    const title = $("#title-input").value.trim();
    const announcement = $("#announcement-input").value.trim();
    if (title) $("#event-title").textContent = title;
    if (announcement) setAnnouncement(announcement);
    state.celebrationSound = $("#celebration-sound").value;
    state.studentIntroEnabled = $("#student-intro-toggle").checked;
    state.participantQueueEnabled = $("#participant-queue-toggle").checked;
    state.studentName = $("#student-name-input").value.trim() || "Student";
    state.participantNames = $("#participant-names-input").value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    setParticipantQueueVisible(state.participantQueueEnabled);
    if (state.participantNames.length > 0) state.nextParticipantIndex %= state.participantNames.length;
    else state.nextParticipantIndex = 0;
    setParticipantQueueStatus(state.participantNames.length > 0
      ? `Next: ${state.participantNames[state.nextParticipantIndex]}.`
      : "Add participant names in Settings first.");
    closeSettings();
  }

  function setupFullscreen() {
    const button = $("#fullscreen-button");
    button.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (error) {
        console.error("Unable to toggle fullscreen:", error);
        setStatus(state.activeMode === "stopwatch" ? $("#stopwatch-status") : $("#countdown-status"), "Fullscreen is unavailable in this browser.");
      }
    });
    document.addEventListener("fullscreenchange", () => {
      const enabled = Boolean(document.fullscreenElement);
      document.body.classList.toggle("projector", enabled);
      button.setAttribute("aria-label", enabled ? "Exit fullscreen" : "Enter fullscreen");
      button.title = enabled ? "Exit fullscreen" : "Projector view";
      button.querySelector(".button-label").textContent = enabled ? "Exit" : "Projector";
    });
  }

  function setupEvents() {
    $("#start-counter").addEventListener("click", () => {
      $("#splash").classList.add("leaving");
      window.setTimeout(() => {
        $("#splash").hidden = true;
        const mainScreen = $("#main-screen");
        mainScreen.hidden = false;
        mainScreen.classList.add("visible");
        mainScreen.setAttribute("aria-hidden", "false");
        $("#marquee").classList.remove("hidden");
      }, 520);
    });

    document.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => switchMode(button.dataset.mode));
    });
    $("#countdown-toggle").addEventListener("click", () => {
      if (state.countdownRunning) startCountdown();
      else triggerMainProcess("countdown");
    });
    $("#stopwatch-toggle").addEventListener("click", () => {
      if (state.stopwatchRunning) pauseStopwatch();
      else triggerMainProcess("stopwatch");
    });
    $("#countdown-reset").addEventListener("click", resetAllTimers);
    $("#stopwatch-reset").addEventListener("click", resetAllTimers);
    document.querySelectorAll("[data-participant-welcome]")
      .forEach((button) => button.addEventListener("click", welcomeNextParticipant));
    $("#set-stopwatch-limit").addEventListener("click", () => {
      const limit = readStopwatchLimit();
      if (!Number.isFinite(limit)) {
        setStatus($("#stopwatch-status"), "Enter a valid time limit.");
        return;
      }
      cancelIntro();
      clearInterval(state.stopwatchInterval);
      state.stopwatchInterval = null;
      state.stopwatchRunning = false;
      state.stopwatchElapsed = 0;
      state.stopwatchStartedAt = 0;
      state.stopwatchLimit = limit;
      state.stopwatchLastTickSecond = null;
      state.stopwatchCompleted = false;
      renderStopwatch();
      setStopwatchButton(false);
      setStatus($("#stopwatch-status"), limit > 0
        ? "Time limit set. Start the stopwatch when ready."
        : "No time limit. Stopwatch will run until paused or reset.");
    });
    $("#set-duration").addEventListener("click", () => {
      const duration = readDuration();
      if (!Number.isFinite(duration) || duration <= 0) {
        setStatus($("#countdown-status"), "Enter a valid duration greater than zero.");
        return;
      }
      cancelIntro();
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
      state.countdownRunning = false;
      state.countdownSource = "duration";
      state.countdownRemaining = duration;
      state.countdownConfiguredDuration = duration;
      state.countdownResetLocked = false;
      state.countdownCompleted = false;
      state.countdownPaused = false;
      writeCountdown(duration);
      setCountdownButton(false);
      setStatus($("#countdown-status"), "Custom duration set. Press Start when ready.");
    });
    $("#target-date").addEventListener("change", () => {
      cancelIntro();
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
      state.countdownRunning = false;
      state.countdownSource = "target";
      state.countdownRemaining = Math.max(0, readTarget() - Date.now()) || 0;
      state.countdownConfiguredDuration = 0;
      state.countdownResetLocked = false;
      state.countdownCompleted = false;
      state.countdownPaused = false;
      writeCountdown(state.countdownRemaining);
      setCountdownButton(false);
      setStatus($("#countdown-status"), "Target updated. Press Start when ready.");
    });
    $("#clock-format").addEventListener("click", (event) => {
      state.clock24Hour = !state.clock24Hour;
      event.currentTarget.textContent = state.clock24Hour ? "Switch to 12-hour" : "Switch to 24-hour";
      renderClock();
    });
    $("#theme-button").addEventListener("click", () => {
      state.theme = themes[(themes.indexOf(state.theme) + 1) % themes.length];
      document.documentElement.dataset.theme = state.theme;
      $("#theme-button").title = `Theme: ${state.theme === "slate" ? "Dark Slate & Cyan" : state.theme === "navy" ? "Classic Navy & Gold" : "Academic Maroon & White"}`;
    });
    $("#settings-button").addEventListener("click", openSettings);
    $("#settings-save").addEventListener("click", saveSettings);
    $("#settings-cancel").addEventListener("click", closeSettings);
    $("#settings-modal").addEventListener("click", (event) => {
      if (event.target === $("#settings-modal")) closeSettings();
    });
    $("#intro-cancel").addEventListener("click", () => {
      const mode = state.pendingStartMode;
      cancelIntro();
      if (mode === "countdown") setStatus($("#countdown-status"), "Student intro cancelled.");
      if (mode === "stopwatch") setStatus($("#stopwatch-status"), "Student intro cancelled.");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#settings-modal").hidden) closeSettings();
      if (event.key === "Escape" && state.pendingStartMode) cancelIntro();
      if (event.key === "Enter" && !$("#settings-modal").hidden && event.target.matches("input")) saveSettings();
    });
    window.addEventListener("resize", () => {
      if (!$("#confetti-canvas").hidden && state.confettiFrame) {
        $("#confetti-canvas").width = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
        $("#confetti-canvas").height = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);
      }
    });
  }

  function initialize() {
    generateDigitGrid($("#countdown-digits"), digitLayouts.countdown, "Time remaining");
    generateDigitGrid($("#stopwatch-digits"), digitLayouts.stopwatch, "Stopwatch elapsed time");
    $("#target-date").value = createDefaultTarget();
    setAnnouncement($("#announcement-input").value);
    writeCountdown(0);
    renderStopwatch();
    renderClock();
    state.clockInterval = window.setInterval(() => {
      if (state.activeMode === "clock") renderClock();
    }, 250);
    setupEvents();
    setupFullscreen();
  }

  initialize();
})();
