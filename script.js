// ---- Tunables / system ----
let thold = 15;
let spifac = 3.25;
let drag = 0.01;
let big = 900;          // number of particles
let bodies = [];

let mX = 0, mY = 0;     // "world" position that particles chase
let lastLat, lastLon;

let scaleFactor = 1;    // current zoom
let targetScale = 1;    // target zoom (eased toward)
let maxDist = 0;        // farthest distance from start (meters, mapped to zoom)
let totalDist = 0;      // cumulative meters walked

// Mode settings (Indoor/Outdoor)
let INDOOR = true;
let scaleMeters = 20.0; // meters -> pixels multiplier (higher = more motion)
let minStep = 0.05;     // ignore GPS steps smaller than this (meters)
let strokeAlpha = 120;  // particle stroke alpha
let strokeW = 1.0;      // particle stroke weight

// GPS breadcrumb trail (helps visualize your path)
let trail = [];

// DOM elements for mode & stats
let indoorBtn, outdoorBtn, modeLabel, distLabel, zoomLabel;

function setup() {
  // Canvas with fixed 4:5 aspect ratio
  const h = Math.min(windowHeight - barHeight(), windowWidth * 1.25);
  const w = h * 0.8;
  const c = createCanvas(w, h);
  c.parent('canvas-holder');

  pixelDensity(1); // keeps strokes crisp on mobile
  applyModeStyling();

  background(120, 60, 50);
  smooth();

  for (let i = 0; i < big; i++) bodies.push(new Ball());

  // Hook up buttons
  indoorBtn = document.getElementById('indoorBtn');
  outdoorBtn = document.getElementById('outdoorBtn');
  modeLabel  = document.getElementById('modeLabel');
  distLabel  = document.getElementById('distLabel');
  zoomLabel  = document.getElementById('zoomLabel');

  indoorBtn.addEventListener('click', () => setMode(true));
  outdoorBtn.addEventListener('click', () => setMode(false));

  // GPS
  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(updatePosition, gpsError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
  } else {
    alert("Geolocation not supported on this device/browser.");
  }
}

function draw() {
  // Ease zoom
  const easing = 0.05;
  scaleFactor += (targetScale - scaleFactor) * easing;

  // Camera: keep you centered
  push();
  translate(width / 2, height / 2);
  scale(scaleFactor);
  translate(-mX, -mY);

  // Draw breadcrumb trail under particles
  if (trail.length > 1) {
    push();
    noFill();
    stroke(255, 255, 255, 150);
    beginShape();
    for (const p of trail) vertex(p.x, p.y);
    endShape();
    pop();
  }

  // Render particle system (no fade — accumulates)
  for (const b of bodies) b.render();

  // Debug: red dot at your current position
  noStroke();
  fill(255, 0, 0);
  ellipse(mX, mY, 20 / scaleFactor);

  pop();

  // HUD (top bar labels)
  distLabel.textContent = `Distance: ${(totalDist / 1000).toFixed(2)} km`;
  zoomLabel.textContent = `Zoom: ${scaleFactor.toFixed(2)}×`;
}

function updatePosition(pos) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // Quick visual debug in tab title
  document.title = `Lat:${lat.toFixed(5)} Lon:${lon.toFixed(5)}`;
  console.log("GPS:", lat, lon);

  if (lastLat === undefined) {
    lastLat = lat; lastLon = lon;
    trail.push({ x: mX, y: mY }); // seed trail
    return;
  }

  // Meters moved (approx)
  const dxMeters = (lon - lastLon) * 111320 * Math.cos(radians(lat));
  const dyMeters = (lat - lastLat) * 110540;
  const stepDist = Math.hypot(dxMeters, dyMeters);

  // Ignore very tiny jitter
  if (stepDist < minStep) return;

  // Move our world position (meters -> pixels)
  mX += dxMeters * scaleMeters;
  mY -= dyMeters * scaleMeters;

  // Record path
  trail.push({ x: mX, y: mY });
  if (trail.length > 6000) trail.shift();

  // Metrics & zoom target (0–5000m -> 1.0–0.15)
  totalDist += stepDist;
  const distFromStart = Math.hypot(mX, mY);
  if (distFromStart > maxDist) maxDist = distFromStart;
  targetScale = map(maxDist, 0, 5000, 1.0, 0.15, true);

  lastLat = lat; lastLon = lon;
}

function gpsError(err) {
  console.error("GPS error:", err);
}

// ---- Particles ----
class Ball {
  constructor() {
    this.X = random(-width / 2, width / 2);
    this.Y = random(-height / 2, height / 2);
    this.Xv = 0; this.Yv = 0;
    this.pX = this.X; this.pY = this.Y;
    this.w  = random(12 / thold, thold);
  }

  render() {
    // Attractive force toward mX,mY with anisotropy on Y via 'w'
    this.Xv += drag * (mX - this.X) * 20;
    this.Yv += drag * (mY - this.Y) * this.w;

    // Damping
    this.Xv /= spifac;
    this.Yv /= spifac;

    // Integrate
    this.X += this.Xv;
    this.Y += this.Yv;

    // Draw trail segment
    stroke(200, 255, 255, strokeAlpha);
    strokeWeight(strokeW);
    line(this.X, this.Y, this.pX, this.pY);

    // Save previous
    this.pX = this.X; this.pY = this.Y;
  }
}

// ---- Mode switching & layout ----
function setMode(indoor) {
  INDOOR = indoor;
  if (INDOOR) {
    scaleMeters = 20.0;   // sensitive for tiny indoor moves
    minStep     = 0.05;   // accept small GPS deltas
    strokeAlpha = 120;
    strokeW     = 1.0;
    indoorBtn.classList.add('active');
    outdoorBtn.classList.remove('active');
    indoorBtn.setAttribute('aria-pressed', 'true');
    outdoorBtn.setAttribute('aria-pressed', 'false');
    modeLabel.textContent = 'Mode: Indoor';
  } else {
    scaleMeters = 2.5;    // calmer outdoor mapping
    minStep     = 0.2;    // ignore micro-jitter
    strokeAlpha = 40;
    strokeW     = 0.5;
    outdoorBtn.classList.add('active');
    indoorBtn.classList.remove('active');
    outdoorBtn.setAttribute('aria-pressed', 'true');
    indoorBtn.setAttribute('aria-pressed', 'false');
    modeLabel.textContent = 'Mode: Outdoor';
  }
  applyModeStyling();
}

function applyModeStyling() {
  // Apply drawing style immediately
  strokeWeight(strokeW);
  stroke(200, 255, 255, strokeAlpha);
}

function windowResized() {
  const h = Math.min(windowHeight - barHeight(), windowWidth * 1.25);
  const w = h * 0.8;
  resizeCanvas(w, h);
}

function barHeight() {
  // Height of the sticky control bar (approx; keeps 4:5 space correct)
  const bar = document.querySelector('.bar');
  return bar ? bar.getBoundingClientRect().height : 56;
}

// Utility: degrees to radians (p5 has radians() but we also need Math.cos)
function radians(deg) { return (deg * Math.PI) / 180; }

