// ===== Walk Painter: anchored live view -> End Walk overview =====

// --- Flags ---
const USE_SPRAY = true;    // set false for a clean single line

// --- World state (pre-transform coordinates, origin at start) ---
let path = [];             // [{x,y}] committed samples (world px)
let pending = [];          // samples to draw (for smooth reveal)
let posX = 0, posY = 0;    // current world position
let lastLat, lastLon;
let totalDist = 0;

// --- View modes ---
let mode = "live";         // "live" (anchored bottom-center) or "overview"
let watchId = null;

// --- Live view transform (anchor + rotation) ---
let headingRad = null;     // raw heading (radians, 0=north)
let smHeading = null;      // smoothed heading
const HEADING_EASE = 0.15;

// --- Overview transform (fit path to screen, no rotation) ---
let scaleFactor = 1, targetScale = 1;
let tx = 0, ty = 0;        // world translation for overview (centering)
let ttx = 0, tty = 0;      // target translation
const PAD = 20;
const ZOOM_EASE = 0.08;
const PAN_EASE = 0.1;

let maxAbsX = 0, maxAbsY = 0; // bounds for overview

// --- Sensitivity (Indoor/Outdoor) ---
let INDOOR = true;
let scaleMeters = 20.0;    // meters -> world px
let minStep = 0.05;        // meters jitter filter

// --- Smooth reveal along path ---
const SEG_PX = 3.0;
const MAX_ADD_PER_FRAME = 24;

// --- Spray brush (screen-space consistent) ---
const SPRAY_DENSITY = 70;
const SPRAY_MIN_RADIUS = 8;
const SPRAY_RADIUS_PER_PX = 0.20;
const PRESSURE_SHAPE = 2.2;
const EDGE_FADE = 2.0;
const DOT_ALPHA = 255;
const LINE_COLOR = [255,255,255, DOT_ALPHA];

// --- Simple line style (if USE_SPRAY=false) ---
const LINE_WEIGHT_SCREEN = 3;

// --- UI refs ---
let indoorBtn, outdoorBtn, motionBtn, endBtn, clearBtn, modeLabel, distLabel, zoomLabel;

function setup() {
  // 4:5 canvas
  const h = Math.min(windowHeight - barHeight(), windowWidth * 1.25);
  const w = h * 0.8;
  const c = createCanvas(w, h);
  c.parent('canvas-holder');

  pixelDensity(1);
  background(0);
  noFill();

  // UI
  indoorBtn  = document.getElementById('indoorBtn');
  outdoorBtn = document.getElementById('outdoorBtn');
  motionBtn  = document.getElementById('motionBtn');
  endBtn     = document.getElementById('endBtn');
  clearBtn   = document.getElementById('clearBtn');
  modeLabel  = document.getElementById('modeLabel');
  distLabel  = document.getElementById('distLabel');
  zoomLabel  = document.getElementById('zoomLabel');

  indoorBtn.addEventListener('click', () => setModeIndoor(true));
  outdoorBtn.addEventListener('click', () => setModeIndoor(false));
  motionBtn.addEventListener('click', requestMotionPermission);
  endBtn.addEventListener('click', endWalk);
  clearBtn.addEventListener('click', restart);

  // Orientation (for heading)
  window.addEventListener('deviceorientation', onDeviceOrientation, true);

  // GPS
  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(onPos, onGPSError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 8000
    });
  } else {
    alert('Geolocation not supported on this device/browser.');
  }
}

function draw() {
  background(0);

  // Smooth zoom & pan for overview
  if (mode === "overview") {
    scaleFactor += (targetScale - scaleFactor) * ZOOM_EASE;
    tx += (ttx - tx) * PAN_EASE;
    ty += (tty - ty) * PAN_EASE;
  }

  // Transform
  push();
  if (mode === "live") {
    // Anchor near bottom-center; rotate so heading is up
    translate(width/2, height*0.90);
    if (smHeading != null) rotate(-smHeading);
    translate(-posX, -posY);
  } else {
    // Overview: center whole path on screen, no rotation
    translate(width/2, height/2);
    scale(scaleFactor);
    translate(-tx, -ty);
  }

  // Draw newly revealed segments incrementally (so we accumulate paint)
  let added = 0;
  while (pending.length && added < MAX_ADD_PER_FRAME) {
    const p = pending.shift();
    drawSegment(path.length ? path[path.length - 1] : {x:posX,y:posY}, p);
    path.push(p);

    // Track bounds for overview
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
    added++;
  }

  pop();

  // HUD
  distLabel.textContent = `Distance: ${(totalDist/1000).toFixed(2)} km`;
  zoomLabel.textContent = `Zoom: ${scaleFactor.toFixed(2)}×`;
}

// --- Drawing helpers ---
function drawSegment(a, b) {
  if (USE_SPRAY) {
    // speed (world px) -> brush radius (screen px)
    const speedPx = dist(a.x,a.y,b.x,b.y);
    const rScreen = SPRAY_MIN_RADIUS + speedPx * SPRAY_RADIUS_PER_PX;

    // multiple dabs along the tiny segment
    const lerps = 10;
    for (let i=0;i<lerps;i++) {
      const t = i/lerps;
      const x = lerp(a.x,b.x,t);
      const y = lerp(a.y,b.y,t);
      sprayAtWorld(x,y,rScreen,SPRAY_DENSITY);
    }
  } else {
    // simple line (screen-constant thickness)
    stroke(255);
    strokeWeight(LINE_WEIGHT_SCREEN / (mode==="overview" ? scaleFactor : 1)); // keep approx. screen const.
    line(a.x,a.y,b.x,b.y);
  }
}

function sprayAtWorld(wx, wy, rScreen, density) {
  // In live mode we’re already inside the live transform;
  // in overview we’re also inside the overview transform.
  // We want dots to be 1px on screen regardless of scale:
  const sw = (mode==="overview") ? (1/scaleFactor) : 1;
  const R = rScreen;
  const baseA = DOT_ALPHA;

  for (let j=0;j<density;j++) {
    const theta = random(TWO_PI);
    const rr = R * Math.pow(random(), PRESSURE_SHAPE);  // center-heavy
    const fall = Math.pow(1 - rr/R, EDGE_FADE);
    const a = baseA * fall;
    stroke(LINE_COLOR[0], LINE_COLOR[1], LINE_COLOR[2], a);
    strokeWeight(sw);

    const rx = rr * Math.cos(theta);
    const ry = rr * Math.sin(theta);

    // Convert screen-space offset to world-space under current scale:
    const invScale = (mode==="overview") ? (1/scaleFactor) : 1;
    point(wx + rx*invScale, wy + ry*invScale);
  }
}

// --- GPS handling ---
function onPos(pos) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // Heading from GPS if available (deg CW from north)
  if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) {
    headingRad = radians(pos.coords.heading);
  }

  if (lastLat === undefined) {
    posX = 0; posY = 0;
    path = [{x:posX, y:posY}];
    pending = [];
    maxAbsX = maxAbsY = 0;
    scaleFactor = targetScale = 1;
    tx = ttx = 0; ty = tty = 0;
    lastLat = lat; lastLon = lon;
    return;
  }

  // meters moved
  const dxMeters = (lon - lastLon) * 111320 * Math.cos(radians(lat));
  const dyMeters = (lat - lastLat) * 110540;
  const stepDist = Math.hypot(dxMeters, dyMeters);
  if (stepDist < minStep) return;

  const newX = posX + dxMeters * scaleMeters;
  const newY = posY - dyMeters * scaleMeters;

  // interpolate into tiny segments for smooth reveal
  const start = path.length ? path[path.length - 1] : {x:posX,y:posY};
  const dx = newX - start.x, dy = newY - start.y;
  const distPx = Math.hypot(dx,dy);
  if (distPx <= SEG_PX) {
    pending.push({x:newX,y:newY});
  } else {
    const steps = Math.max(2, Math.ceil(distPx/SEG_PX));
    for (let i=1;i<=steps;i++){
      const t = i/steps;
      pending.push({x:start.x + dx*t, y:start.y + dy*t});
    }
  }

  posX = newX; posY = newY;
  totalDist += stepDist;
  lastLat = lat; lastLon = lon;

  // Smooth heading if we have any estimate
  if (headingRad == null) {
    // infer bearing from last two points (approx)
    headingRad = Math.atan2(dxMeters, dyMeters); // east,north -> atan2(x,y)
  }
  if (smHeading == null) smHeading = headingRad;
  else {
    const d = wrapAngle(headingRad - smHeading);
    smHeading = wrapAngle(smHeading + d * HEADING_EASE);
  }

  // Keep overview targets up-to-date (if user ends walk later)
  updateOverviewTargets();
}

function onGPSError(err) {
  console.error('GPS error:', err);
}

// --- Device orientation for heading (iOS/Android) ---
function onDeviceOrientation(e) {
  let deg = null;
  if (typeof e.webkitCompassHeading === 'number') {
    deg = e.webkitCompassHeading;
  } else if (typeof e.alpha === 'number') {
    deg = 360 - e.alpha; // fallback
  }
  if (deg != null && !isNaN(deg)) {
    const rad = radians(deg);
    if (smHeading == null) smHeading = rad;
    else {
      const d = wrapAngle(rad - smHeading);
      smHeading = wrapAngle(smHeading + d * HEADING_EASE);
    }
    headingRad = rad;
  }
}

async function requestMotionPermission() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') alert('Motion permission denied');
    }
  } catch(e) {
    console.warn('Motion permission request failed:', e);
  }
}

// --- End Walk -> animate to overview & stop GPS ---
function endWalk() {
  mode = "overview";
  // compute final targets for fitting
  updateOverviewTargets(true);
  // stop GPS updates so the drawing freezes
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// Compute center & scale to fit path into the screen
function updateOverviewTargets(force=false) {
  // update bounds from current path & pending last point
  if (path.length) {
    const last = path[path.length-1];
    maxAbsX = Math.max(maxAbsX, Math.abs(last.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(last.y));
  }
  // Required scale to fit extents
  const needX = maxAbsX > 0 ? ((width/2 - PAD) / maxAbsX) : 1;
  const needY = maxAbsY > 0 ? ((height/2 - PAD) / maxAbsY) : 1;
  const needed = Math.min(needX, needY, 1);

  if (mode === "overview" || force) {
    targetScale = needed;
    // Center between min/max; since we tracked only |max|, center is 0,0 (origin at start)
    ttx = 0; tty = 0;
  }
}

// --- Mode & controls ---
function setModeIndoor(indoor) {
  INDOOR = indoor;
  if (INDOOR) {
    scaleMeters = 20.0;  minStep = 0.05;
    indoorBtn.classList.add('active');
    outdoorBtn.classList.remove('active');
    indoorBtn.setAttribute('aria-pressed', 'true');
    outdoorBtn.setAttribute('aria-pressed', 'false');
    modeLabel.textContent = 'Mode: Indoor';
  } else {
    scaleMeters = 3.0;   minStep = 0.5;
    outdoorBtn.classList.add('active');
    indoorBtn.classList.remove('active');
    outdoorBtn.setAttribute('aria-pressed', 'true');
    indoorBtn.setAttribute('aria-pressed', 'false');
    modeLabel.textContent = 'Mode: Outdoor';
  }
  restart();
}

function restart() {
  background(0);
  path = [];
  pending = [];
  posX = 0; posY = 0;
  lastLat = lastLon = undefined;
  totalDist = 0;
  maxAbsX = maxAbsY = 0;
  scaleFactor = targetScale = 1;
  tx = ttx = 0; ty = tty = 0;
  smHeading = headingRad = null;
  mode = "live";
  if (watchId == null && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(onPos, onGPSError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 8000
    });
  }
}

// --- Layout ---
function windowResized() {
  const h = Math.min(windowHeight - barHeight(), windowWidth * 1.25);
  const w = h * 0.8;
  resizeCanvas(w,h);
  // transforms are dynamic; no need to clear
}

function barHeight() {
  const bar = document.querySelector('.bar');
  return bar ? bar.getBoundingClientRect().height : 56;
}

// --- Utils ---
function wrapAngle(a) {
  while (a <= -Math.PI) a += 2*Math.PI;
  while (a >   Math.PI) a -= 2*Math.PI;
  return a;
}

