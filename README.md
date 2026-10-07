# Academy Time

A projector-ready countdown timer, stopwatch, and live digital clock built with semantic HTML, modern CSS, and dependency-free JavaScript.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Semantic splash and timer screens, mode controls, settings dialog, student intro overlay, announcement bar, and asset links. |
| `style.css` | Theme variables, glassmorphic cards, responsive layouts, projector sizing, transitions, and intro/confetti presentation. |
| `script.js` | Timer state, dynamic digit-grid generation, mode controls, speech sequence, Web Audio synth presets, fullscreen handling, and confetti animation. |
| `logo.png` | Optional school logo displayed on both screens. Replace the placeholder with your image using this filename. |

## Features

- Countdown by custom days, hours, minutes, and seconds, or a local calendar target date and time.
- Stopwatch with minutes, seconds, and millisecond precision.
- Live local clock with a 12/24-hour format switch.
- Countdown completion, countdown pause, and stopwatch pause celebrations with canvas confetti and a selectable synthesized sound.
- Techno, retro 8-bit, and cinematic bass-drop sound presets, generated locally with the Web Audio API.
- Optional student intro stage. Enter a name in Settings to speak the greeting and the name alongside each countdown number. Speech uses the Web Speech API when available.
- Dark slate, navy/gold, and maroon themes, projector fullscreen, editable event title, and announcement ticker.
- Responsive high-contrast displays for mobile, laptop, and projector use.

## Run in VS Code

1. Open this folder in Visual Studio Code.
2. Open `index.html` in a browser, or use the **Live Server** extension and choose **Open with Live Server**.
3. Add an academy logo image named `logo.png` to this folder if desired. Without one, a stylized “A” placeholder is shown.
4. Select **START COUNTER**. Use the mode tabs to choose Countdown, Stopwatch, or Digital clock.
5. Open **Settings** to edit the event title and announcement, select the celebration sound, and configure Student Intro Mode and its name.

No package installation, build step, external audio files, or backend server is required. Fullscreen mode must be initiated by a user action; browser speech voices and sound output depend on the device and browser.

## Implementation notes

- Countdown updates use an absolute end timestamp rather than relying on interval frequency, limiting clock drift when a browser tab is throttled.
- A reset stops the countdown and stopwatch, restores their digits and duration fields to zero, and clears the target date. Set a new countdown before starting again.
- Student intro phrases are serialized through speech completion callbacks. The greeting completes before the visible count begins, and the selected timer starts after “Go” finishes.
- All sound presets are synthesized locally with Web Audio oscillators and filters; no third-party assets are fetched.
