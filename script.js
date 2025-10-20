let thold = 15;
let spifac = 3.25;
let drag = 0.01;
let big = 900;
let bodies = [];

let mX = 0;
let mY = 0;
let lastLat, lastLon;

let scaleFactor = 1;     // current scale
let targetScale = 1;     // target scale to ease toward
let maxDist = 0;         // meters from start
let totalDist = 0;

function setup() {
  // Maintain 4:5 aspect ratio
  let h = min(windowHeight, windowWidth * 1.25);
  let w = h * 0.8;
  createCanvas(w, h);
  
  strokeWeight(0.5);
  stroke(200, 255, 255, 5);
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
  // Ease zoom smoothly toward targetScale
  let easing = 0.05; // smaller = slower easing
  scaleFactor += (targetScale - scaleFactor) * easing;

  // Camera transform (keep you centered)
  push();
  translate(width / 2, height / 2);
  scale(scaleFactor);
  translate(-mX, -mY);
  
  for (let b of bodies) {
    b.render();
  }

  pop();

  // Optional info text
  noStroke();
  fill(255);
  textSize(12);
  textAlign(LEFT, BOTTOM);
  text(`Distance walked: ${(totalDist / 1000).toFixed(2)} km`, 10, height - 10);
}

function updatePosition(pos) {
  let lat = pos.coords.latitude;
  let lon = pos.coords.longitude;

  if (lastLat === undefined) {
    lastLat = lat;
    lastLon = lon;
    return;
  }

  // Approx. meters of movement
  let dx = (lon - lastLon) * 111320 * cos(radians(lat));
  let dy = (lat - lastLat) * 110540;
  let stepDist = sqrt(dx * dx + dy * dy);
  
  if (stepDist < 1) return; // ignore small GPS jitter

  // Move world position
  mX += dx;
  mY -= dy;

  // Update distances
  totalDist += stepDist;
  let distFromStart = sqrt(mX * mX + mY * mY);
  if (distFromStart > maxDist) maxDist = distFromStart;

  // Compute new target scale (maps 0–5km → 1–0.15)
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
