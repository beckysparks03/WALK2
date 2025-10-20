let thold = 15;
let spifac = 3.25;
let drag = 0.01;
let big = 900;
let bodies = [];

let mX = 0;
let mY = 0;
let lastLat, lastLon;

let scaleFactor = 1;   // current zoom
let targetScale = 1;   // target zoom
let maxDist = 0;       // farthest distance from start (m)
let totalDist = 0;     // total path distance (m)

// 👉 Indoor tuning: boosts sensitivity & visibility for short walks
const INDOOR = true;
let scaleMeters = INDOOR ? 20.0 : 2.0;     // meters → pixels (higher reacts more)
let minStep = INDOOR ? 0.05 : 0.2;         // ignore jitter below this (meters)

// simple breadcrumb trail of your GPS path (for debugging + nice effect)
let trail = [];

function setup() {
  // Maintain 4:5 aspect ratio
  let h = min(windowHeight, windowWidth * 1.25);
  let w = h * 0.8;
  createCanvas(w, h);
  
  // Make strokes more visible (indoor movement is subtle)
  strokeWeight(INDOOR ? 1 : 0.5);
  stroke(200, 255, 255, INDOOR ? 120 : 5);
  fill(200, 255, 255);
  background(120, 60, 50);
  smooth();

  for (let i = 0; i < big; i++) {
    bodies.push(new Ball());
  }

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
  // Smooth easing toward new zoom
  const easing = 0.05;
  scaleFactor += (targetScale - scaleFactor) * easing;

  // Camera — you stay centered
  push();
  translate(width / 2, height / 2);
  scale(scaleFactor);
  translate(-mX, -mY);

  // Draw your breadcrumb trail first (so particles draw over it)
  if (trail.length > 1) {
    push();
    noFill();
    stroke(255, 255, 255, 120);
    beginShape();
    for (let p of trail) vertex(p.x, p.y);
    endShape();
    pop();
  }

  // Render the particle system
  for (let b of bodies) b.render();

  // Debug: your current position
  noStroke();
  fill(255, 0, 0);
  ellipse(mX, mY, 20 / scaleFactor);

  pop();

  // HUD
  noStroke();
  fill(255);
  textSize(12);
  textAlign(LEFT, BOTTOM);
  text(
    `Distance: ${(totalDist / 1000).toFixed(2)} km  |  Zoom: ${scaleFactor.toFixed(2)}  |  Indoor: ${INDOOR ? "on" : "off"}`,
    10, height - 10
  );
}

function updatePosition(pos) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  console.log("GPS:", lat, lon);
  document.title = `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;

  if (lastLat === undefined) {
    lastLat = lat;
    lastLon = lon;
    // seed trail at start
    trail.push({ x: mX, y: mY });
    return;
  }

  // Approx. meters moved
  const dxMeters = (lon - lastLon) * 111320 * cos(radians(lat));
  const dyMeters = (lat - lastLat) * 110540;
  const stepDist = Math.hypot(dxMeters, dyMeters);

  // Ignore tiny GPS jitter
  if (stepDist < minStep) return;

  // Map meters → pixels (higher scaleMeters = more motion)
  mX += dxMeters * scaleMeters;
  mY -= dyMeters * scaleMeters;

  // Record trail point
  trail.push({ x: mX, y: mY });
  if (trail.length > 5000) trail.shift(); // keep memory in check

  // Distance stats & zoom target
  totalDist += stepDist;
  const distFromStart = Math.hypot(mX, mY);
  if (distFromStart > maxDist) maxDist = distFromStart;

  // Target zoom (0 → 5 km → 1 → 0.15)
  targetScale = map(maxDist, 0, 5000, 1, 0.15, true);

  lastLat = lat;
  lastLon = lon;
}

function gpsError(err) {
  console.error("GPS error:", err);
}

class Ball {
  constructor() {
    this.X = random(-width / 2, width / 2);
    this.Y = random(-height / 2, height / 2);
    this.Xv = 0;
    this.Yv = 0;
    this.pX = this.X;
    this.pY = this.Y;
    this.w = random(12 / thold, thold);
  }

  render() {
    this.Xv += drag * (mX - this.X) * 20;
    this.Yv += drag * (mY - this.Y) * this.w;
    this.Xv /= spifac;
    this.Yv /= spifac;
    this.X += this.Xv;
    this.Y += this.Yv;

    line(this.X, this.Y, this.pX, this.pY);
    this.pX = this.X;
    this.pY = this.Y;
  }
}

function windowResized() {
  let h = min(windowHeight, windowWidth * 1.25);
  let w = h * 0.8;
  resizeCanvas(w, h);
}

