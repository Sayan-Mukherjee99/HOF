import { useEffect, useRef } from "react";

export interface DataRainPalette {
  calm?: string;
  mid?: string;
  hot?: string;
}

export interface DataRainProps {
  count?: number;
  flowSpeed?: number;
  obstacleRadius?: number;
  autopilot?: boolean;
  fullscreen?: boolean;
  palette?: DataRainPalette;
  className?: string;
}

const MAX_PARTICLES = 7000;
const TRAIL_LENGTH = 19;
const DT = 1 / 60;
const PUFF_COUNT = 32;
const TWO_PI = Math.PI * 2;
const NUM_BINS = 6;
const STRIDE = 3;

const DEFAULT_CALM = [34, 230, 255]; // cyan #22e6ff
const DEFAULT_MID = [138, 92, 255]; // purple #8a5cff
const DEFAULT_HOT = [255, 61, 154]; // pink #ff3d9a
const DEFAULT_CORE = [234, 252, 255]; // core #eafcff

const ZV = [0.2, 0.32, 0.48];
const V_FACTORS = [0.7, 0.9, 1.2];
const OV = 1.3;
const DV = 1.4;

const DAMP_VEL = 1 - Math.exp(-DT / 0.12);
const DAMP_SPEED = 1 - Math.exp(-DT * 8);
const DAMP_POINTER = 1 - Math.exp(-DT * 18);
const DAMP_VEL_DELTA = 1 - Math.exp(-DT * 10);
const DAMP_ATTRACT = 1 - Math.exp(-DT / 0.06);
const DAMP_RELEASE = 1 - Math.exp(-DT / 0.2);
const FLASH_RATE = 0.03 * DT;
const FLASH_DECAY = Math.exp(-DT / 0.45);
const PUFF_DECAY = Math.exp(-DT / 1.1);

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 1831565813) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex?: string, fallback: number[] = [255, 255, 255]): number[] {
  if (!hex) return fallback;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function makeWave(wavelength: number, angle: number, omega: number, phase: number, amp: number) {
  const k = TWO_PI / wavelength;
  return {
    kx: k * Math.cos(angle),
    ky: k * Math.sin(angle),
    om: omega,
    ph: phase,
    au: amp * Math.sin(angle),
    av: -amp * Math.cos(angle),
  };
}

const wave1 = makeWave(380, 0.35, 0.18, 0.7, 16);
const wave2 = makeWave(620, 1.9, 0.27, 2.1, 13);
const wave3 = makeWave(900, 3.4, 0.35, 4.2, 10);

export function DataRain(props: DataRainProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const bloomCanvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const controllerRef = useRef<{ refresh: () => void } | null>(null);

  propsRef.current = props;

  useEffect(() => {
    const rootEl = rootRef.current;
    const mainCanvas = mainCanvasRef.current;
    const bloomCanvas = bloomCanvasRef.current;
    if (!rootEl || !mainCanvas || !bloomCanvas) return;

    const mainCtx = mainCanvas.getContext("2d");
    const bloomCtx = bloomCanvas.getContext("2d");
    if (!mainCtx || !bloomCtx) return;

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = mulberry32(7);
    let isDisposed = false;
    let isInitialized = false;
    let isRunning = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let bloomWidth = 1;
    let bloomHeight = 1;

    // Particle memory buffers
    const posX = new Float32Array(MAX_PARTICLES);
    const posY = new Float32Array(MAX_PARTICLES);
    const velX = new Float32Array(MAX_PARTICLES);
    const velY = new Float32Array(MAX_PARTICLES);
    const depth = new Float32Array(MAX_PARTICLES);
    const baseSpeed = new Float32Array(MAX_PARTICLES);
    const speedRatio = new Float32Array(MAX_PARTICLES);
    const flashIntensity = new Float32Array(MAX_PARTICLES);
    const trailCounts = new Uint8Array(MAX_PARTICLES);
    const trailHistX = new Float32Array(MAX_PARTICLES * TRAIL_LENGTH);
    const trailHistY = new Float32Array(MAX_PARTICLES * TRAIL_LENGTH);

    let trailRingIdx = 0;
    const binBuckets: Int32Array[] = [];
    for (let i = 0; i < 6; i++) {
      binBuckets.push(new Int32Array(MAX_PARTICLES));
    }
    const binCounts = new Int32Array(6);
    const strokeColors = new Array(6 * NUM_BINS).fill("");
    const strokeWidths = new Float32Array(6 * NUM_BINS);
    const coreColors = ["", ""];
    let puffRadialGradient: CanvasGradient | null = null;

    // Vortex puff state
    const puffX = new Float32Array(PUFF_COUNT);
    const puffY = new Float32Array(PUFF_COUNT);
    const puffVort = new Float32Array(PUFF_COUNT);
    const puffAge = new Float32Array(PUFF_COUNT);
    const puffActive = new Uint8Array(PUFF_COUNT);
    const activePuffX = new Float32Array(PUFF_COUNT);
    const activePuffY = new Float32Array(PUFF_COUNT);
    const activePuffVortNorm = new Float32Array(PUFF_COUNT);
    const activePuffScale = new Float32Array(PUFF_COUNT);
    const activePuffRadiusSq = new Float32Array(PUFF_COUNT);

    let activePuffCount = 0;
    let puffNextIdx = 0;
    let puffSign = 1;
    let puffAccumDist = 0;
    let simTime = 0;
    let activeTime = 0;
    let activeParticles = 0;
    let targetParticleCount = 0;
    let autoThrottleScale = 1;
    let isUserInteracting = false;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let lastInteractTime = 0;
    let idleDelay = 1.2;
    let currentInteractMode = 0; // 0: none, 1: autopilot, 2: user
    let smoothedPointerX = 0;
    let smoothedPointerY = 0;
    let prevSmoothedPointerX = 0;
    let prevSmoothedPointerY = 0;
    let pointerVelX = 0;
    let pointerVelY = 0;
    let interactWeight = 0;
    let obstacleEffectiveRadius = 64;
    let animFrameId = 0;
    let lastFrameTime = 0;
    let frameAccumulator = 0;
    let avgDeltaTime = 16.7;
    let avgComputeTime = 4;
    let slowFrameStreak = 0;
    let fastFrameStreak = 0;

    const buildStyles = () => {
      const style = getComputedStyle(rootEl);
      const palette = propsRef.current.palette;
      const calm = parseHex(palette?.calm ?? style.getPropertyValue("--dr-calm"), DEFAULT_CALM);
      const mid = parseHex(palette?.mid ?? style.getPropertyValue("--dr-mid"), DEFAULT_MID);
      const hot = parseHex(palette?.hot ?? style.getPropertyValue("--dr-hot"), DEFAULT_HOT);
      const core = parseHex(style.getPropertyValue("--dr-core"), DEFAULT_CORE);
      const colorGroups = [calm, mid, hot];

      for (let bin = 0; bin < 6; bin++) {
        const isForeground = bin < 3 ? 0 : 1;
        const colorIdx = bin % 3;
        const rgb = colorGroups[colorIdx];

        for (let seg = 0; seg < NUM_BINS; seg++) {
          const segFade = Math.pow(1 - (seg + 0.5) / NUM_BINS, 1.5);
          const alpha = Math.min(0.95, ZV[colorIdx] * (isForeground === 0 ? 0.55 : 1) * segFade * OV);
          strokeColors[bin * NUM_BINS + seg] = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
          const widthVal = V_FACTORS[colorIdx] * (isForeground === 0 ? 0.75 : 1) * (1 - (0.45 * seg) / NUM_BINS);
          strokeWidths[bin * NUM_BINS + seg] = clamp(widthVal, 0.6, 1.3);
        }
      }

      coreColors[0] = `rgba(${core[0]},${core[1]},${core[2]},0.5)`;
      coreColors[1] = `rgba(${core[0]},${core[1]},${core[2]},0.85)`;

      const grad = mainCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, `rgba(${hot[0]},${hot[1]},${hot[2]},1)`);
      grad.addColorStop(0.45, `rgba(${hot[0]},${hot[1]},${hot[2]},0.32)`);
      grad.addColorStop(1, `rgba(${hot[0]},${hot[1]},${hot[2]},0)`);
      puffRadialGradient = grad;
    };

    const seedParticle = (idx: number, randomY: boolean) => {
      let x: number, y: number;
      if (randomY) {
        x = rng() * width;
        y = rng() * height;
      } else {
        x = -40 + rng() * (width + 80);
        y = -40 - rng() * 80;
      }
      const d = 0.35 + 0.65 * rng();
      const speed = 70 + 90 * d * d;
      const flow = clamp(propsRef.current.flowSpeed ?? 1, 0.05, 5);
      depth[idx] = d;
      baseSpeed[idx] = speed;
      trailCounts[idx] = 9 + Math.floor(rng() * 11);
      posX[idx] = x;
      posY[idx] = y;
      velX[idx] = 0;
      velY[idx] = speed * flow;
      speedRatio[idx] = 1;
      flashIntensity[idx] = 0;

      const baseRing = idx * TRAIL_LENGTH;
      for (let s = 0; s < TRAIL_LENGTH; s++) {
        trailHistX[baseRing + s] = x;
        trailHistY[baseRing + s] = y;
      }
    };

    const seedAll = () => {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        seedParticle(i, true);
      }
    };

    const setActiveCount = (count: number, randomY: boolean) => {
      const clamped = clamp(Math.round(count), 1, MAX_PARTICLES);
      for (let i = activeParticles; i < clamped; i++) {
        seedParticle(i, randomY);
      }
      activeParticles = clamped;
    };

    const applyCount = (randomY: boolean) => {
      const autoCount = clamp(Math.round((width * height) / 520), 1200, 5200);
      const userCount = propsRef.current.count;
      targetParticleCount = clamp(Math.round(userCount !== undefined ? userCount : autoCount), 1, MAX_PARTICLES);
      setActiveCount(targetParticleCount * autoThrottleScale, randomY);
    };

    const spawnPuff = (radius: number, speed: number) => {
      const invSpeed = speed > 0 ? 1 / speed : 0;
      const normVx = pointerVelX * invSpeed;
      const normVy = pointerVelY * invSpeed;
      const s = puffSign;
      puffSign = -puffSign;
      const idx = puffNextIdx;
      puffNextIdx = (puffNextIdx + 1) % PUFF_COUNT;

      puffX[idx] = smoothedPointerX - normVx * 0.6 * radius - normVy * s * 0.7 * radius;
      puffY[idx] = smoothedPointerY - normVy * 0.6 * radius + normVx * s * 0.7 * radius;
      puffVort[idx] = clamp(s * Math.min(speed, 1200) * radius * 1.5, -105000, 105000);
      puffAge[idx] = 0;
      puffActive[idx] = 1;
    };

    const simulate = () => {
      const currentProps = propsRef.current;
      const flow = clamp(currentProps.flowSpeed ?? 1, 0.05, 5);
      const baseObstacleRadius = currentProps.obstacleRadius ?? 64;
      const autopilot = currentProps.autopilot ?? true;

      trailRingIdx = (trailRingIdx + 1) % TRAIL_LENGTH;
      simTime += DT;
      if (isRunning) activeTime += DT;

      const allowAutopilot =
        !prefersReducedMotion && autopilot && !isUserInteracting && isRunning && activeTime - lastInteractTime >= idleDelay;
      const interactMode = isUserInteracting ? 2 : allowAutopilot ? 1 : 0;

      let targetX = smoothedPointerX;
      let targetY = smoothedPointerY;
      if (interactMode === 1) {
        targetX = width * (0.5 + 0.32 * Math.sin(0.37 * activeTime));
        targetY = height * (0.5 + 0.28 * Math.sin(0.53 * activeTime + 1.2));
      } else if (interactMode === 2) {
        targetX = pointerTargetX;
        targetY = pointerTargetY;
      }

      const justActivated = interactMode !== 0 && currentInteractMode === 0 && interactWeight < 0.05;
      currentInteractMode = interactMode;

      if (justActivated) {
        smoothedPointerX = targetX;
        smoothedPointerY = targetY;
        prevSmoothedPointerX = smoothedPointerX;
        prevSmoothedPointerY = smoothedPointerY;
        pointerVelX = 0;
        pointerVelY = 0;
      } else {
        prevSmoothedPointerX = smoothedPointerX;
        prevSmoothedPointerY = smoothedPointerY;
        smoothedPointerX += (targetX - smoothedPointerX) * DAMP_POINTER;
        smoothedPointerY += (targetY - smoothedPointerY) * DAMP_POINTER;
        pointerVelX += ((smoothedPointerX - prevSmoothedPointerX) / DT - pointerVelX) * DAMP_VEL_DELTA;
        pointerVelY += ((smoothedPointerY - prevSmoothedPointerY) / DT - pointerVelY) * DAMP_VEL_DELTA;
      }

      interactWeight += ((interactMode !== 0 ? 1 : 0) - interactWeight) * (interactMode !== 0 ? DAMP_ATTRACT : DAMP_RELEASE);

      const effectiveWeight = interactWeight;
      const pointerSpeed = Math.sqrt(pointerVelX * pointerVelX + pointerVelY * pointerVelY);
      const obstacleRadius = baseObstacleRadius + Math.min(pointerSpeed * 0.025, 36);
      obstacleEffectiveRadius = obstacleRadius;

      if (effectiveWeight > 0.3 && pointerSpeed > 60) {
        const dx = smoothedPointerX - prevSmoothedPointerX;
        const dy = smoothedPointerY - prevSmoothedPointerY;
        puffAccumDist += Math.sqrt(dx * dx + dy * dy);
        let spawned = 0;
        while (puffAccumDist >= 28 && spawned < 4) {
          puffAccumDist -= 28;
          spawned++;
          spawnPuff(obstacleRadius, pointerSpeed);
        }
        if (puffAccumDist >= 28) puffAccumDist = 0;
      } else {
        puffAccumDist = 0;
      }

      activePuffCount = 0;
      const puffDrift = 0.5 * 115 * flow * DT;
      for (let p = 0; p < PUFF_COUNT; p++) {
        if (puffActive[p] === 0) continue;
        const age = puffAge[p] + DT;
        if (age > 2.4) {
          puffActive[p] = 0;
          continue;
        }
        puffAge[p] = age;
        puffVort[p] *= PUFF_DECAY;
        puffY[p] += puffDrift;

        const scaleVal = 676 + 90 * age;
        activePuffX[activePuffCount] = puffX[p];
        activePuffY[activePuffCount] = puffY[p];
        activePuffVortNorm[activePuffCount] = puffVort[p] / TWO_PI;
        activePuffScale[activePuffCount] = scaleVal;
        activePuffRadiusSq[activePuffCount] = 36 * scaleVal;
        activePuffCount++;
      }

      const wave1T = wave1.om * simTime + wave1.ph;
      const wave2T = wave2.om * simTime + wave2.ph;
      const wave3T = wave3.om * simTime + wave3.ph;
      const hasSoftInteract = effectiveWeight > 0.002;
      const hasHardInteract = effectiveWeight > 0.05;
      const repelScale = Math.min(1, effectiveWeight * 1.5);
      const bottomLimit = height + 40;
      const rightLimit = width + 120;

      for (let i = 0; i < activeParticles; i++) {
        const px = posX[i];
        const py = posY[i];
        const d = depth[i];
        const targetV = baseSpeed[i] * flow;

        const c1 = Math.cos(wave1.kx * px + wave1.ky * py + wave1T);
        const c2 = Math.cos(wave2.kx * px + wave2.ky * py + wave2T);
        const c3 = Math.cos(wave3.kx * px + wave3.ky * py + wave3T);

        let fx = (wave1.au * c1 + wave2.au * c2 + wave3.au * c3) * d;
        let fy = targetV + (wave1.av * c1 + wave2.av * c2 + wave3.av * c3) * d;

        const depthWeight = 0.55 + 0.45 * d;
        const localRadius = obstacleRadius * depthWeight;
        const dx = px - smoothedPointerX;
        const dy = py - smoothedPointerY;
        let repX = 0;
        let repY = 0;
        let shadowSlow = 0;

        if (hasSoftInteract) {
          const distSq = dx * dx + dy * dy;
          let relVx = -pointerVelX;
          let relVy = targetV - pointerVelY;
          let relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

          if (relSpeed > 0.001) {
            if (relSpeed > 900) {
              const sc = 900 / relSpeed;
              relVx *= sc;
              relVy *= sc;
              relSpeed = 900;
            }
            const unitVx = relVx / relSpeed;
            const unitVy = relVy / relSpeed;
            const projPar = dx * unitVx + dy * unitVy;
            const projPerp = -dx * unitVy + dy * unitVx;

            if (projPar > 0 && projPar < 12 * localRadius) {
              const sigma = 0.9 * localRadius + 0.2 * projPar;
              const normPerp = projPerp / sigma;
              shadowSlow = 0.55 * Math.exp(-projPar / (3 * localRadius)) * Math.exp(-normPerp * normPerp);
            }

            const outerRadius = 9 * localRadius;
            if (distSq < outerRadius * outerRadius) {
              const denom = Math.max(projPar * projPar + projPerp * projPerp, localRadius * localRadius * 0.64);
              const kernel = (localRadius * localRadius) / (denom * denom);
              const potX = -relSpeed * kernel * (projPar * projPar - projPerp * projPerp);
              const potY = -relSpeed * kernel * 2 * projPar * projPerp;
              let blend = 1;
              const innerRadius = 5 * localRadius;
              if (distSq > innerRadius * innerRadius) {
                const s = (Math.sqrt(distSq) - innerRadius) / (4 * localRadius);
                blend = 1 - s * s * (3 - 2 * s);
              }
              repX = (potX * unitVx - potY * unitVy) * blend;
              repY = (potX * unitVy + potY * unitVx) * blend;
            }
          }
        }

        let puffForceX = 0;
        let puffForceY = 0;
        for (let p = 0; p < activePuffCount; p++) {
          const pdx = px - activePuffX[p];
          const pdy = py - activePuffY[p];
          const pDistSq = pdx * pdx + pdy * pdy + 0.001;
          const maxDistSq = activePuffRadiusSq[p];
          if (pDistSq < maxDistSq) {
            const kern = (activePuffVortNorm[p] * (1 - Math.exp(-pDistSq / activePuffScale[p]))) / pDistSq;
            const falloff = 1 - pDistSq / maxDistSq;
            const mag = kern * falloff * falloff * depthWeight;
            puffForceX += -pdy * mag;
            puffForceY += pdx * mag;
          }
        }

        const flowScale = 1 - shadowSlow * effectiveWeight;
        fx = fx * flowScale + repX * effectiveWeight + puffForceX;
        fy = fy * flowScale + repY * effectiveWeight + puffForceY;

        let nextVx = velX[i] + (fx - velX[i]) * DAMP_VEL;
        let nextVy = velY[i] + (fy - velY[i]) * DAMP_VEL;
        const totalVelSq = nextVx * nextVx + nextVy * nextVy;
        if (totalVelSq > 810000) {
          const sc = 900 / Math.sqrt(totalVelSq);
          nextVx *= sc;
          nextVy *= sc;
        }

        let nextPx = px + nextVx * DT;
        let nextPy = py + nextVy * DT;

        if (hasHardInteract) {
          const hardRadius = localRadius * repelScale;
          const hdx = nextPx - smoothedPointerX;
          const hdy = nextPy - smoothedPointerY;
          const hDistSq = hdx * hdx + hdy * hdy;
          const safeDist = 0.98 * hardRadius;
          if (hDistSq < safeDist * safeDist) {
            const hDist = Math.sqrt(hDistSq);
            const normX = hDist < 0.001 ? 0 : hdx / hDist;
            const normY = hDist < 0.001 ? 1 : hdy / hDist;
            nextPx = smoothedPointerX + normX * hardRadius;
            nextPy = smoothedPointerY + normY * hardRadius;
            const relDot = (nextVx - pointerVelX) * normX + (nextVy - pointerVelY) * normY;
            if (relDot < 0) {
              nextVx -= relDot * normX;
              nextVy -= relDot * normY;
            }
          }
        }

        velX[i] = nextVx;
        velY[i] = nextVy;
        posX[i] = nextPx;
        posY[i] = nextPy;

        if (nextPy > bottomLimit || nextPx < -120 || nextPx > rightLimit || nextPy < -600) {
          seedParticle(i, false);
          continue;
        }

        speedRatio[i] += (Math.sqrt(nextVx * nextVx + nextVy * nextVy) / targetV - speedRatio[i]) * DAMP_SPEED;
        if (rng() < FLASH_RATE) {
          flashIntensity[i] = 1;
        } else {
          const nextFlash = flashIntensity[i] * FLASH_DECAY;
          flashIntensity[i] = nextFlash < 0.01 ? 0 : nextFlash;
        }

        const ringOffset = i * TRAIL_LENGTH + trailRingIdx;
        trailHistX[ringOffset] = nextPx;
        trailHistY[ringOffset] = nextPy;
      }
    };

    const render = () => {
      mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mainCtx.clearRect(0, 0, width, height);
      mainCtx.globalCompositeOperation = "lighter";
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";

      if (interactWeight > 0.02 && puffRadialGradient) {
        const pSpeed = Math.sqrt(pointerVelX * pointerVelX + pointerVelY * pointerVelY);
        const auraRadius = 1.5 * obstacleEffectiveRadius;
        mainCtx.globalAlpha = Math.min(1, (0.05 + Math.min(pSpeed / 4000, 0.07)) * interactWeight);
        mainCtx.setTransform(dpr * auraRadius, 0, 0, dpr * auraRadius, dpr * smoothedPointerX, dpr * smoothedPointerY);
        mainCtx.fillStyle = puffRadialGradient;
        mainCtx.fillRect(-1, -1, 2, 2);
        mainCtx.globalAlpha = 1;
        mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      binCounts.fill(0);
      for (let i = 0; i < activeParticles; i++) {
        const sr = speedRatio[i];
        let colorBin = sr < 1.25 ? 0 : sr < 1.85 ? 1 : 2;
        if (flashIntensity[i] > 0.35 && colorBin < 2) colorBin++;
        const layerBin = (depth[i] < 0.62 ? 0 : 3) + colorBin;
        binBuckets[layerBin][binCounts[layerBin]++] = i;
      }

      for (let b = 0; b < 6; b++) {
        const count = binCounts[b];
        if (count === 0) continue;
        const bucket = binBuckets[b];

        for (let seg = 0; seg < NUM_BINS; seg++) {
          const segStart = seg * STRIDE;
          const segEnd = segStart + STRIDE;
          mainCtx.strokeStyle = strokeColors[b * NUM_BINS + seg];
          mainCtx.lineWidth = strokeWidths[b * NUM_BINS + seg];
          mainCtx.beginPath();

          for (let p = 0; p < count; p++) {
            const pIdx = bucket[p];
            const maxSegs = trailCounts[pIdx] - 1;
            if (segStart >= maxSegs) continue;
            const pRingBase = pIdx * TRAIL_LENGTH;
            const renderEnd = Math.min(segEnd, maxSegs);
            let histIdx = (trailRingIdx - segStart + TRAIL_LENGTH) % TRAIL_LENGTH;
            mainCtx.moveTo(trailHistX[pRingBase + histIdx], trailHistY[pRingBase + histIdx]);

            for (let s = segStart; s < renderEnd; s++) {
              histIdx = histIdx === 0 ? TRAIL_LENGTH - 1 : histIdx - 1;
              mainCtx.lineTo(trailHistX[pRingBase + histIdx], trailHistY[pRingBase + histIdx]);
            }
          }
          mainCtx.stroke();
        }
      }

      const prevRingIdx = trailRingIdx === 0 ? TRAIL_LENGTH - 1 : trailRingIdx - 1;
      mainCtx.lineWidth = DV;
      for (let coreLayer = 0; coreLayer < 2; coreLayer++) {
        mainCtx.strokeStyle = coreColors[coreLayer];
        mainCtx.beginPath();
        for (let speedTier = 1; speedTier < 3; speedTier++) {
          const binIdx = coreLayer * 3 + speedTier;
          const count = binCounts[binIdx];
          const bucket = binBuckets[binIdx];
          for (let p = 0; p < count; p++) {
            const pIdx = bucket[p];
            if (speedTier === 1 && flashIntensity[pIdx] <= 0.5) continue;
            const pRingBase = pIdx * TRAIL_LENGTH;
            mainCtx.moveTo(trailHistX[pRingBase + trailRingIdx], trailHistY[pRingBase + trailRingIdx]);
            mainCtx.lineTo(trailHistX[pRingBase + prevRingIdx], trailHistY[pRingBase + prevRingIdx]);
          }
        }
        mainCtx.stroke();
      }

      bloomCtx.clearRect(0, 0, bloomWidth, bloomHeight);
      bloomCtx.drawImage(mainCanvas, 0, 0, bloomWidth, bloomHeight);
    };

    const presimulate = (seconds: number) => {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) {
        simulate();
      }
    };

    const rebuildStatic = () => {
      seedAll();
      activeParticles = 0;
      applyCount(true);
      isUserInteracting = true;
      pointerTargetX = width * 0.4;
      pointerTargetY = height * 0.45;
      smoothedPointerX = pointerTargetX;
      smoothedPointerY = pointerTargetY;
      prevSmoothedPointerX = smoothedPointerX;
      prevSmoothedPointerY = smoothedPointerY;
      pointerVelX = 0;
      pointerVelY = 0;
      interactWeight = 1;
      currentInteractMode = 2;
      activePuffCount = 0;
      puffActive.fill(0);
      presimulate(3);
      render();
    };

    const handleResize = () => {
      const rect = rootEl.getBoundingClientRect();
      const newW = Math.max(1, rect.width || window.innerWidth);
      const newH = Math.max(1, rect.height || window.innerHeight);
      let newDpr = Math.min(window.devicePixelRatio || 1, 2);

      if (newW * newH * newDpr * newDpr > 4500000) {
        newDpr = Math.sqrt(4500000 / (newW * newH));
      }

      if (newW === width && newH === height && newDpr === dpr) return;

      width = newW;
      height = newH;
      dpr = newDpr;
      mainCanvas.width = Math.max(1, Math.round(width * dpr));
      mainCanvas.height = Math.max(1, Math.round(height * dpr));
      bloomWidth = Math.max(1, Math.ceil(width / 4));
      bloomHeight = Math.max(1, Math.ceil(height / 4));
      bloomCanvas.width = bloomWidth;
      bloomCanvas.height = bloomHeight;
      bloomCtx.imageSmoothingEnabled = true;
      bloomCtx.imageSmoothingQuality = "medium";

      if (!isInitialized) return;

      if (prefersReducedMotion) {
        rebuildStatic();
        return;
      }

      for (let i = 0; i < activeParticles; i++) {
        if (posX[i] < -120 || posX[i] > width + 120 || posY[i] > height + 40) {
          seedParticle(i, false);
        }
      }
      applyCount(true);
      render();
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = rootEl.getBoundingClientRect();
      pointerTargetX = e.clientX - rect.left;
      pointerTargetY = e.clientY - rect.top;
      isUserInteracting = true;
    };

    const onPointerLeave = () => {
      if (isUserInteracting) {
        isUserInteracting = false;
        lastInteractTime = activeTime;
        idleDelay = 4;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onPointerLeave();
    };

    const onFrame = (timestamp: number) => {
      if (isDisposed) return;
      const deltaMs = Math.max(0, timestamp - lastFrameTime);
      lastFrameTime = timestamp;
      frameAccumulator += Math.min(0.05, deltaMs / 1000);

      const startTime = performance.now();
      let steps = 0;
      while (frameAccumulator >= DT && steps < 3) {
        simulate();
        frameAccumulator -= DT;
        steps++;
      }
      if (steps === 3) frameAccumulator = 0;
      if (steps > 0) render();

      const computeMs = performance.now() - startTime;
      if (deltaMs > 0 && deltaMs < 100) {
        avgDeltaTime += (deltaMs - avgDeltaTime) * 0.05;
        avgComputeTime += (computeMs - avgComputeTime) * 0.05;
      }

      if (avgDeltaTime > 20) {
        slowFrameStreak++;
        fastFrameStreak = 0;
      } else if (avgDeltaTime < 18.5 && avgComputeTime < 12) {
        fastFrameStreak++;
        slowFrameStreak = 0;
      } else {
        slowFrameStreak = 0;
        fastFrameStreak = 0;
      }

      if (slowFrameStreak >= 60 && autoThrottleScale > 0.4) {
        autoThrottleScale = Math.max(0.4, autoThrottleScale - 0.1);
        slowFrameStreak = 0;
        applyCount(false);
      } else if (fastFrameStreak >= 180 && autoThrottleScale < 1) {
        autoThrottleScale = Math.min(1, autoThrottleScale + 0.05);
        fastFrameStreak = 0;
        applyCount(false);
      }

      animFrameId = requestAnimationFrame(onFrame);
    };

    const startAnim = () => {
      cancelAnimationFrame(animFrameId);
      lastFrameTime = performance.now();
      frameAccumulator = 0;
      animFrameId = requestAnimationFrame(onFrame);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameId);
        animFrameId = 0;
      } else if (isRunning && !isDisposed) {
        startAnim();
      }
    };

    handleResize();
    buildStyles();
    seedAll();
    applyCount(true);
    smoothedPointerX = prevSmoothedPointerX = pointerTargetX = width * 0.5;
    smoothedPointerY = prevSmoothedPointerY = pointerTargetY = height * 0.5;

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(rootEl);

    controllerRef.current = {
      refresh: () => {
        if (isDisposed || !isInitialized) return;
        buildStyles();
        if (prefersReducedMotion) rebuildStatic();
        else applyCount(false);
      },
    };

    if (prefersReducedMotion) {
      isInitialized = true;
      rebuildStatic();
    } else {
      presimulate(2.5);
      render();
      isInitialized = true;
      isRunning = true;
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      window.addEventListener("pointercancel", onPointerLeave, { passive: true });
      window.addEventListener("blur", onPointerLeave);
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibilityChange);
      startAnim();
    }

    return () => {
      isDisposed = true;
      isRunning = false;
      cancelAnimationFrame(animFrameId);
      animFrameId = 0;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      controllerRef.current = null;
    };
  }, []);

  const palette = props.palette;
  useEffect(() => {
    controllerRef.current?.refresh();
  }, [props.count, palette?.calm, palette?.mid, palette?.hot]);

  const rootClass =
    "dr-root" +
    (props.fullscreen ?? true ? "" : " dr-root--contained") +
    (props.className ? " " + props.className : "");

  return (
    <div ref={rootRef} className={rootClass} aria-hidden="true">
      <canvas ref={bloomCanvasRef} className="dr-bloom" />
      <canvas ref={mainCanvasRef} className="dr-main" />
      <div className="dr-vignette" />
      <div className="dr-grain" />
    </div>
  );
}
