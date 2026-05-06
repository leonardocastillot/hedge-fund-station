import React from 'react';
import * as THREE from 'three';
import type { VoiceStatus } from '@/hooks/useVoiceRecorder';

type VoiceOrbSceneProps = {
  status: VoiceStatus;
  durationSeconds: number;
  audioLevel: number;
  onRenderError?: () => void;
};

type CloudPalette = {
  core: THREE.Color;
  mid: THREE.Color;
  outer: THREE.Color;
  glow: THREE.Color;
  breath: number;
};

const PALETTES: Record<string, CloudPalette> = {
  recording: {
    core: new THREE.Color(1.0, 1.0, 1.0),
    mid: new THREE.Color(0.92, 0.92, 0.94),
    outer: new THREE.Color(0.78, 0.78, 0.82),
    glow: new THREE.Color(1.0, 1.0, 1.0),
    breath: 1.6
  },
  transcribing: {
    core: new THREE.Color(0.96, 0.96, 0.98),
    mid: new THREE.Color(0.75, 0.75, 0.80),
    outer: new THREE.Color(0.55, 0.55, 0.60),
    glow: new THREE.Color(0.88, 0.88, 0.92),
    breath: 1.2
  },
  ready: {
    core: new THREE.Color(0.95, 0.97, 0.95),
    mid: new THREE.Color(0.72, 0.76, 0.72),
    outer: new THREE.Color(0.52, 0.56, 0.52),
    glow: new THREE.Color(0.82, 0.86, 0.82),
    breath: 1.0
  },
  error: {
    core: new THREE.Color(0.98, 0.88, 0.88),
    mid: new THREE.Color(0.80, 0.55, 0.55),
    outer: new THREE.Color(0.62, 0.38, 0.38),
    glow: new THREE.Color(0.85, 0.50, 0.50),
    breath: 0.9
  },
  idle: {
    core: new THREE.Color(0.94, 0.94, 0.96),
    mid: new THREE.Color(0.68, 0.68, 0.72),
    outer: new THREE.Color(0.44, 0.44, 0.50),
    glow: new THREE.Color(0.82, 0.82, 0.86),
    breath: 1.0
  }
};

function getPalette(status: VoiceStatus): CloudPalette {
  return PALETTES[status] || PALETTES.idle;
}

/* ── custom shader for soft circular particles with glow halo ── */

const particleVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);

    float circle = 1.0 - smoothstep(0.15, 0.48, dist);
    float core = exp(-dist * 12.0) * 0.8;
    float bloom = exp(-dist * 3.5) * 0.35;

    float alpha = (circle + core + bloom) * vAlpha;
    if (alpha < 0.002) discard;

    vec3 col = mix(vColor, vec3(1.0), exp(-dist * 10.0) * 0.7);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── energy core sphere shader ── */

const coreVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
    float rim = pow(fresnel, 2.5) * 1.4;
    float pulse = 0.85 + sin(uTime * 3.0) * 0.15;
    float coreGlow = exp(-fresnel * 1.8) * 0.6 * pulse;
    float flicker = 0.95 + sin(uTime * 7.3) * 0.03 + sin(uTime * 13.1) * 0.02;
    vec3 col = uColor * (coreGlow + rim * 0.5) * uIntensity * flicker;
    float alpha = (rim * 0.7 + coreGlow * 0.9) * uIntensity;
    alpha = clamp(alpha, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── seeded pseudo-random for deterministic placement ── */

function seededNoise(index: number, salt = 0): number {
  const raw = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

/* ── smooth 3D noise approximation for organic motion ── */

function fbmDisplace(x: number, y: number, z: number, t: number): [number, number, number] {
  const dx =
    Math.sin(x * 1.7 + t * 0.55) * 0.045 +
    Math.sin(y * 2.3 + t * 0.75) * 0.028 +
    Math.cos(z * 1.9 + t * 0.65) * 0.018 +
    Math.sin(x * 3.1 + t * 1.1) * 0.008;
  const dy =
    Math.cos(y * 1.5 + t * 0.48) * 0.038 +
    Math.sin(z * 2.1 + t * 0.68) * 0.022 +
    Math.sin(x * 1.8 + t * 0.58) * 0.015 +
    Math.cos(y * 2.9 + t * 1.0) * 0.007;
  const dz =
    Math.sin(z * 1.6 + t * 0.52) * 0.042 +
    Math.cos(x * 2.0 + t * 0.62) * 0.025 +
    Math.cos(y * 1.7 + t * 0.58) * 0.016 +
    Math.sin(z * 3.3 + t * 0.95) * 0.006;
  return [dx, dy, dz];
}

/* ── lerp helpers ── */

function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): void {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
}

export const VoiceOrbScene: React.FC<VoiceOrbSceneProps> = ({ status, durationSeconds, audioLevel, onRenderError }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const statusRef = React.useRef(status);
  const durationRef = React.useRef(durationSeconds);
  const audioLevelRef = React.useRef(audioLevel);

  React.useEffect(() => {
    statusRef.current = status;
    durationRef.current = durationSeconds;
    audioLevelRef.current = audioLevel;
  }, [audioLevel, durationSeconds, status]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.0, 5.8);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      onRenderError?.();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    /* ── primary nebula particles ── */
    const particleCount = 720;
    const positions = new Float32Array(particleCount * 3);
    const basePositions = new Float32Array(particleCount * 3);
    const formedPositions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const alphas = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // scattered cloud positions (ellipsoidal)
      const phi = seededNoise(i, 1) * Math.PI * 2;
      const cosTheta = 2 * seededNoise(i, 2) - 1;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const r = 0.4 + Math.pow(seededNoise(i, 3), 0.6) * 1.8;

      basePositions[i3] = r * sinTheta * Math.cos(phi);
      basePositions[i3 + 1] = r * cosTheta * 0.92;
      basePositions[i3 + 2] = r * sinTheta * Math.sin(phi) * 0.75;

      // formed helix positions
      const t = i / particleCount;
      const turn = t * Math.PI * 7;
      const spine = (t - 0.5) * 2.3;
      const helixR = 0.14 + Math.sin(i * 0.071) * 0.04 + seededNoise(i, 5) * 0.12;
      formedPositions[i3] = Math.cos(turn) * helixR + Math.sin(spine * 2.1) * 0.07;
      formedPositions[i3 + 1] = spine;
      formedPositions[i3 + 2] = Math.sin(turn) * helixR * 0.7 + Math.cos(spine * 1.8) * 0.06;

      // initial position = scattered
      positions[i3] = basePositions[i3];
      positions[i3 + 1] = basePositions[i3 + 1];
      positions[i3 + 2] = basePositions[i3 + 2];

      // variable sizes for depth illusion
      sizes[i] = 0.014 + seededNoise(i, 6) * 0.032;
      alphas[i] = 0.18 + seededNoise(i, 7) * 0.52;
      // initial colors — monochrome silver/white
      colors[i3] = 0.72;
      colors[i3 + 1] = 0.72;
      colors[i3 + 2] = 0.75;
    }

    const nebulaGeometry = new THREE.BufferGeometry();
    nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    nebulaGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    nebulaGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    nebulaGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    orbGroup.add(nebula);

    /* ── ambient dust layer (large soft motes) ── */
    const dustCount = 40;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustSizes = new Float32Array(dustCount);
    const dustAlphas = new Float32Array(dustCount);
    const dustColors = new Float32Array(dustCount * 3);
    const dustBasePositions = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      const i3 = i * 3;
      dustBasePositions[i3] = (seededNoise(i, 20) - 0.5) * 2.6;
      dustBasePositions[i3 + 1] = (seededNoise(i, 21) - 0.5) * 2.2;
      dustBasePositions[i3 + 2] = (seededNoise(i, 22) - 0.5) * 1.2;
      dustPositions[i3] = dustBasePositions[i3];
      dustPositions[i3 + 1] = dustBasePositions[i3 + 1];
      dustPositions[i3 + 2] = dustBasePositions[i3 + 2];
      dustSizes[i] = 0.045 + seededNoise(i, 23) * 0.07;
      dustAlphas[i] = 0.035 + seededNoise(i, 24) * 0.055;
      dustColors[i3] = 0.82;
      dustColors[i3 + 1] = 0.82;
      dustColors[i3 + 2] = 0.84;
    }

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
    dustGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlphas, 1));
    dustGeometry.setAttribute('aColor', new THREE.BufferAttribute(dustColors, 3));

    const dustMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const dust = new THREE.Points(dustGeometry, dustMaterial);
    orbGroup.add(dust);

    /* ── glowing energy core sphere ── */
    const coreSphereGeo = new THREE.SphereGeometry(0.18, 32, 32);
    const coreSphereMat = new THREE.ShaderMaterial({
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.6 },
        uColor: { value: new THREE.Color(0.92, 0.92, 0.95) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide
    });
    const coreSphere = new THREE.Mesh(coreSphereGeo, coreSphereMat);
    orbGroup.add(coreSphere);

    /* ── orbital ring particles ── */
    const ringCount = 160;
    const ringPositions = new Float32Array(ringCount * 3);
    const ringSizes = new Float32Array(ringCount);
    const ringAlphas = new Float32Array(ringCount);
    const ringColors = new Float32Array(ringCount * 3);
    const ringAngles = new Float32Array(ringCount);
    const ringRadii = new Float32Array(ringCount);
    const ringYOffsets = new Float32Array(ringCount);

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + seededNoise(i, 40) * 0.3;
      const radius = 0.9 + seededNoise(i, 41) * 0.5;
      const yOff = (seededNoise(i, 42) - 0.5) * 0.12;
      ringAngles[i] = angle;
      ringRadii[i] = radius;
      ringYOffsets[i] = yOff;
      const i3 = i * 3;
      ringPositions[i3] = Math.cos(angle) * radius;
      ringPositions[i3 + 1] = yOff;
      ringPositions[i3 + 2] = Math.sin(angle) * radius;
      ringSizes[i] = 0.008 + seededNoise(i, 43) * 0.016;
      ringAlphas[i] = 0.12 + seededNoise(i, 44) * 0.25;
      ringColors[i3] = 0.8;
      ringColors[i3 + 1] = 0.8;
      ringColors[i3 + 2] = 0.84;
    }

    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute('aSize', new THREE.BufferAttribute(ringSizes, 1));
    ringGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(ringAlphas, 1));
    ringGeometry.setAttribute('aColor', new THREE.BufferAttribute(ringColors, 3));

    const ringMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const ringGroup = new THREE.Group();
    ringGroup.rotation.x = Math.PI * 0.42;
    ringGroup.rotation.z = Math.PI * 0.08;
    const ringMesh = new THREE.Points(ringGeometry, ringMaterial);
    ringGroup.add(ringMesh);
    orbGroup.add(ringGroup);

    /* ── energy streak particles (shoot outward on recording) ── */
    const streakCount = 60;
    const streakPositions = new Float32Array(streakCount * 3);
    const streakSizes = new Float32Array(streakCount);
    const streakAlphas = new Float32Array(streakCount);
    const streakColors = new Float32Array(streakCount * 3);
    const streakVelocities = new Float32Array(streakCount * 3);
    const streakLifetimes = new Float32Array(streakCount);

    for (let i = 0; i < streakCount; i++) {
      streakLifetimes[i] = -1; // inactive
      const i3 = i * 3;
      streakPositions[i3] = 0;
      streakPositions[i3 + 1] = 0;
      streakPositions[i3 + 2] = 0;
      streakSizes[i] = 0.02;
      streakAlphas[i] = 0;
      streakColors[i3] = 1.0;
      streakColors[i3 + 1] = 1.0;
      streakColors[i3 + 2] = 1.0;
    }

    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
    streakGeometry.setAttribute('aSize', new THREE.BufferAttribute(streakSizes, 1));
    streakGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(streakAlphas, 1));
    streakGeometry.setAttribute('aColor', new THREE.BufferAttribute(streakColors, 3));

    const streakMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const streaks = new THREE.Points(streakGeometry, streakMaterial);
    orbGroup.add(streaks);
    let streakSpawnTimer = 0;

    /* ── abstract face: eye focal points ── */
    const eyeCount = 2;
    const eyePositions = new Float32Array(eyeCount * 3);
    const eyeSizes = new Float32Array(eyeCount);
    const eyeAlphas = new Float32Array(eyeCount);
    const eyeColors = new Float32Array(eyeCount * 3);

    // left eye
    eyePositions[0] = -0.32; eyePositions[1] = 0.22; eyePositions[2] = 0.6;
    // right eye
    eyePositions[3] = 0.32; eyePositions[4] = 0.22; eyePositions[5] = 0.6;
    for (let i = 0; i < eyeCount; i++) {
      eyeSizes[i] = 0.06;
      eyeAlphas[i] = 0.5;
      const i3 = i * 3;
      eyeColors[i3] = 1.0; eyeColors[i3 + 1] = 1.0; eyeColors[i3 + 2] = 1.0;
    }

    const eyeGeometry = new THREE.BufferGeometry();
    eyeGeometry.setAttribute('position', new THREE.BufferAttribute(eyePositions, 3));
    eyeGeometry.setAttribute('aSize', new THREE.BufferAttribute(eyeSizes, 1));
    eyeGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(eyeAlphas, 1));
    eyeGeometry.setAttribute('aColor', new THREE.BufferAttribute(eyeColors, 3));

    const eyeMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const eyes = new THREE.Points(eyeGeometry, eyeMaterial);
    orbGroup.add(eyes);

    /* ── abstract face: waveform mouth ── */
    const mouthSegments = 32;
    const mouthPositions = new Float32Array(mouthSegments * 3);
    const mouthSizes = new Float32Array(mouthSegments);
    const mouthAlphas = new Float32Array(mouthSegments);
    const mouthColors = new Float32Array(mouthSegments * 3);

    for (let i = 0; i < mouthSegments; i++) {
      const t = i / (mouthSegments - 1);
      const i3 = i * 3;
      mouthPositions[i3] = (t - 0.5) * 0.7;
      mouthPositions[i3 + 1] = -0.18;
      mouthPositions[i3 + 2] = 0.6;
      mouthSizes[i] = 0.018;
      mouthAlphas[i] = 0.3;
      mouthColors[i3] = 0.92; mouthColors[i3 + 1] = 0.92; mouthColors[i3 + 2] = 0.95;
    }

    const mouthGeometry = new THREE.BufferGeometry();
    mouthGeometry.setAttribute('position', new THREE.BufferAttribute(mouthPositions, 3));
    mouthGeometry.setAttribute('aSize', new THREE.BufferAttribute(mouthSizes, 1));
    mouthGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(mouthAlphas, 1));
    mouthGeometry.setAttribute('aColor', new THREE.BufferAttribute(mouthColors, 3));

    const mouthMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mouth = new THREE.Points(mouthGeometry, mouthMaterial);
    orbGroup.add(mouth);

    /* ── ethereal ribbon spines (CatmullRom curves) ── */
    const spineCount = 5;
    const spinePointCount = 100;
    const spines = Array.from({ length: spineCount }, (_, si) => {
      const curvePoints = Array.from({ length: spinePointCount }, (_, pi) => {
        const t = pi / (spinePointCount - 1);
        const y = (t - 0.5) * 2.6;
        const angle = t * Math.PI * 4.0 + si * (Math.PI * 2 / spineCount);
        const radius = 0.16 + si * 0.03 + Math.sin(t * Math.PI) * 0.08;
        return new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        );
      });

      const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5);
      const tubePoints = curve.getPoints(140);
      const geometry = new THREE.BufferGeometry().setFromPoints(tubePoints);
      const material = new THREE.LineBasicMaterial({
        color: 0xe8e8ec,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending
      });
      const line = new THREE.Line(geometry, material);
      orbGroup.add(line);
      return { line, material, curvePoints };
    });

    /* ── lighting — pure white for monochrome aesthetic ── */
    const innerGlow = new THREE.PointLight(0xffffff, 5, 8);
    innerGlow.position.set(0, 0.15, 2.0);
    scene.add(innerGlow);

    const rimLight = new THREE.PointLight(0xe0e0e6, 1.8, 6);
    rimLight.position.set(-1.5, 0.8, 3.0);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0xd8d8dc, 0.2));

    /* ── resize handling ── */
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const pr = Math.min(window.devicePixelRatio, 2);
      nebulaMaterial.uniforms.uPixelRatio.value = pr;
      dustMaterial.uniforms.uPixelRatio.value = pr;
      ringMaterial.uniforms.uPixelRatio.value = pr;
      streakMaterial.uniforms.uPixelRatio.value = pr;
      eyeMaterial.uniforms.uPixelRatio.value = pr;
      mouthMaterial.uniforms.uPixelRatio.value = pr;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    /* ── animation loop ── */
    let frameId = 0;
    const clock = new THREE.Clock();
    let prevTime = 0;
    const tmpColor = new THREE.Color();
    // Track smooth palette transition
    const currentPalette: CloudPalette = {
      core: getPalette('idle').core.clone(),
      mid: getPalette('idle').mid.clone(),
      outer: getPalette('idle').outer.clone(),
      glow: getPalette('idle').glow.clone(),
      breath: 0.72
    };

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const dt = Math.min(elapsed - prevTime, 0.05);
      prevTime = elapsed;
      const mic = statusRef.current === 'recording' ? audioLevelRef.current : 0;
      const targetPalette = getPalette(statusRef.current);
      // multi-layered breathing for organic feel
      const breathe = (Math.sin(elapsed * 0.9) + 1) * 0.5;
      const breathe2 = (Math.sin(elapsed * 1.7 + 0.5) + 1) * 0.5;
      const breatheMix = breathe * 0.65 + breathe2 * 0.35;
      const pulse = (Math.sin(elapsed * 2.8) + 1) * 0.5;

      // recording shockwave: pulsing expansion and contraction
      const recPulse = statusRef.current === 'recording'
        ? Math.sin(elapsed * 4.5) * 0.5 + 0.5
        : 0;

      // formation blend: how much particles gather into the helix
      // idle has a gentle breathing formation so particles softly coalesce
      const formation = Math.min(1, statusRef.current === 'recording'
        ? 0.25 + mic * 0.75 - recPulse * mic * 0.18
        : statusRef.current === 'transcribing'
          ? 0.35 + pulse * 0.12
          : 0.08 + breatheMix * 0.1);

      // smooth palette lerp
      const paletteLerp = Math.min(1, dt * 3.5);
      lerpColor(currentPalette.core, currentPalette.core, targetPalette.core, paletteLerp);
      lerpColor(currentPalette.mid, currentPalette.mid, targetPalette.mid, paletteLerp);
      lerpColor(currentPalette.outer, currentPalette.outer, targetPalette.outer, paletteLerp);
      lerpColor(currentPalette.glow, currentPalette.glow, targetPalette.glow, paletteLerp);
      currentPalette.breath += (targetPalette.breath - currentPalette.breath) * paletteLerp;

      /* update nebula particles */
      const posAttr = nebulaGeometry.getAttribute('position') as THREE.BufferAttribute;
      const sizeAttr = nebulaGeometry.getAttribute('aSize') as THREE.BufferAttribute;
      const alphaAttr = nebulaGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const colorAttr = nebulaGeometry.getAttribute('aColor') as THREE.BufferAttribute;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const bx = basePositions[i3];
        const by = basePositions[i3 + 1];
        const bz = basePositions[i3 + 2];
        const fx = formedPositions[i3];
        const fy = formedPositions[i3 + 1];
        const fz = formedPositions[i3 + 2];

        // lerp between scattered and formed
        let x = bx + (fx - bx) * formation;
        let y = by + (fy - by) * formation;
        let z = bz + (fz - bz) * formation;

        // organic noise displacement — always visible, amplified when recording
        const [dx, dy, dz] = fbmDisplace(x, y, z, elapsed);
        const noiseAmp = 1.6 + breatheMix * 0.5 + mic * 4.0;
        x += dx * noiseAmp;
        y += dy * noiseAmp;
        z += dz * noiseAmp;

        // shockwave expansion: particles radiate outward on mic peaks
        if (statusRef.current === 'recording' && mic > 0.1) {
          const dist = Math.sqrt(x * x + y * y + z * z) + 0.001;
          const wave = recPulse * mic * 0.35;
          x += (x / dist) * wave;
          y += (y / dist) * wave;
          z += (z / dist) * wave;
        }

        posAttr.setXYZ(i, x, y, z);

        // dynamic size: alive breathing in idle, explosive in recording
        const baseSize = 0.014 + seededNoise(i, 6) * 0.032;
        const idleSizePulse = breatheMix * 0.18 + breathe2 * 0.08;
        const micSizeBurst = statusRef.current === 'recording' ? mic * 1.2 + recPulse * mic * 0.4 : 0;
        sizeAttr.setX(i, baseSize * (1.15 + idleSizePulse + micSizeBurst + formation * 0.3));

        // dynamic alpha — visible and warm in idle, blazing in recording
        const baseAlpha = 0.18 + seededNoise(i, 7) * 0.52;
        const idleAlpha = breatheMix * 0.15 + 0.2;
        const micAlpha = statusRef.current === 'recording' ? mic * 0.6 : 0;
        alphaAttr.setX(i, baseAlpha * (idleAlpha + formation * 0.5 + micAlpha + 0.6));

        // color: radial gradient from core to outer
        const distFromCenter = Math.sqrt(x * x + y * y + z * z);
        const colorT = Math.min(1, distFromCenter / 1.6);
        if (colorT < 0.4) {
          lerpColor(tmpColor, currentPalette.core, currentPalette.mid, colorT / 0.4);
        } else {
          lerpColor(tmpColor, currentPalette.mid, currentPalette.outer, (colorT - 0.4) / 0.6);
        }
        colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      }
      posAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;

      /* update dust */
      const dustPosAttr = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      const dustAlphaAttr = dustGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const dustColorAttr = dustGeometry.getAttribute('aColor') as THREE.BufferAttribute;

      for (let i = 0; i < dustCount; i++) {
        const i3 = i * 3;
        // much more visible ambient drift
        const drift = Math.sin(elapsed * 0.5 + i * 0.21) * (0.08 + mic * 0.06);
        const float = Math.cos(elapsed * 0.38 + i * 0.17) * 0.07;
        const sway = Math.sin(elapsed * 0.28 + i * 0.31) * 0.04;
        dustPosAttr.setXYZ(
          i,
          dustBasePositions[i3] + drift + sway,
          dustBasePositions[i3 + 1] + float,
          dustBasePositions[i3 + 2] - drift * 0.5
        );
        dustAlphaAttr.setX(i, (0.05 + breatheMix * 0.06 + mic * 0.06));
        dustColorAttr.setXYZ(i, currentPalette.mid.r, currentPalette.mid.g, currentPalette.mid.b);
      }
      dustPosAttr.needsUpdate = true;
      dustAlphaAttr.needsUpdate = true;
      dustColorAttr.needsUpdate = true;

      /* update energy core sphere — alive breathing even in idle */
      coreSphereMat.uniforms.uTime.value = elapsed;
      const coreIntensity = statusRef.current === 'recording'
        ? 0.9 + mic * 1.5 + recPulse * mic * 0.4
        : statusRef.current === 'transcribing'
          ? 0.6 + pulse * 0.25
          : 0.55 + breatheMix * 0.3 + breathe2 * 0.1;
      coreSphereMat.uniforms.uIntensity.value = coreIntensity;
      coreSphereMat.uniforms.uColor.value.copy(currentPalette.core);
      const coreScale = statusRef.current === 'recording'
        ? 0.8 + breathe * 0.1 + mic * 0.5 + recPulse * mic * 0.2
        : 0.85 + breatheMix * 0.18 + breathe2 * 0.06;
      coreSphere.scale.setScalar(coreScale);

      /* update orbital ring */
      const ringPosAttr = ringGeometry.getAttribute('position') as THREE.BufferAttribute;
      const ringAlphaAttr = ringGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const ringColorAttr = ringGeometry.getAttribute('aColor') as THREE.BufferAttribute;
      const ringSizeAttr = ringGeometry.getAttribute('aSize') as THREE.BufferAttribute;
      // ring always orbiting at a comfortable pace, faster on recording
      const ringSpeed = 0.25 + breatheMix * 0.08 + mic * 0.6;
      for (let i = 0; i < ringCount; i++) {
        const a = ringAngles[i] + elapsed * ringSpeed * (0.8 + seededNoise(i, 45) * 0.4);
        const rWobble = Math.sin(elapsed * 1.5 + i * 0.1) * 0.08 + Math.sin(elapsed * 0.7 + i * 0.23) * 0.04;
        const r = ringRadii[i] + rWobble * (1 + mic * 2);
        const yFloat = ringYOffsets[i] + Math.sin(elapsed * 0.9 + i * 0.07) * 0.05;
        ringPosAttr.setXYZ(i, Math.cos(a) * r, yFloat, Math.sin(a) * r);
        ringAlphaAttr.setX(i, (0.15 + seededNoise(i, 44) * 0.25) * (0.7 + breatheMix * 0.4 + mic * 1.2));
        ringSizeAttr.setX(i, (0.01 + seededNoise(i, 43) * 0.018) * (1.1 + breatheMix * 0.3 + mic * 1.5));
        ringColorAttr.setXYZ(i, currentPalette.mid.r, currentPalette.mid.g, currentPalette.mid.b);
      }
      ringPosAttr.needsUpdate = true;
      ringAlphaAttr.needsUpdate = true;
      ringColorAttr.needsUpdate = true;
      ringSizeAttr.needsUpdate = true;
      ringGroup.rotation.y = elapsed * 0.12;
      ringGroup.rotation.x = Math.PI * 0.42 + Math.sin(elapsed * 0.18) * 0.04;

      /* update energy streaks */
      const sPosAttr = streakGeometry.getAttribute('position') as THREE.BufferAttribute;
      const sAlphaAttr = streakGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const sSizeAttr = streakGeometry.getAttribute('aSize') as THREE.BufferAttribute;

      // spawn new streaks when recording
      if (statusRef.current === 'recording' && mic > 0.15) {
        streakSpawnTimer += dt;
        const spawnRate = 0.03 + (1 - mic) * 0.06;
        while (streakSpawnTimer > spawnRate) {
          streakSpawnTimer -= spawnRate;
          for (let i = 0; i < streakCount; i++) {
            if (streakLifetimes[i] < 0) {
              streakLifetimes[i] = 0;
              const phi = Math.random() * Math.PI * 2;
              const ct = Math.random() * 2 - 1;
              const st = Math.sqrt(1 - ct * ct);
              const speed = 1.8 + Math.random() * 2.5;
              const i3 = i * 3;
              streakPositions[i3] = 0;
              streakPositions[i3 + 1] = 0;
              streakPositions[i3 + 2] = 0;
              streakVelocities[i3] = st * Math.cos(phi) * speed;
              streakVelocities[i3 + 1] = ct * speed;
              streakVelocities[i3 + 2] = st * Math.sin(phi) * speed;
              break;
            }
          }
        }
      }

      for (let i = 0; i < streakCount; i++) {
        if (streakLifetimes[i] < 0) {
          sAlphaAttr.setX(i, 0);
          continue;
        }
        streakLifetimes[i] += dt;
        const life = streakLifetimes[i];
        const maxLife = 0.6;
        if (life > maxLife) {
          streakLifetimes[i] = -1;
          sAlphaAttr.setX(i, 0);
          continue;
        }
        const i3 = i * 3;
        streakPositions[i3] += streakVelocities[i3] * dt;
        streakPositions[i3 + 1] += streakVelocities[i3 + 1] * dt;
        streakPositions[i3 + 2] += streakVelocities[i3 + 2] * dt;
        sPosAttr.setXYZ(i, streakPositions[i3], streakPositions[i3 + 1], streakPositions[i3 + 2]);
        const fade = 1.0 - (life / maxLife);
        sAlphaAttr.setX(i, fade * fade * 0.7);
        sSizeAttr.setX(i, 0.015 + fade * 0.025);
      }
      sPosAttr.needsUpdate = true;
      sAlphaAttr.needsUpdate = true;
      sSizeAttr.needsUpdate = true;

      /* update abstract face — eyes */
      const eyePosAttr = eyeGeometry.getAttribute('position') as THREE.BufferAttribute;
      const eyeAlphaAttr = eyeGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const eyeSizeAttr = eyeGeometry.getAttribute('aSize') as THREE.BufferAttribute;
      const eyeColorAttr = eyeGeometry.getAttribute('aColor') as THREE.BufferAttribute;

      // subtle blink every ~4s
      const blinkCycle = elapsed % 4.0;
      const blink = blinkCycle > 3.7 ? 1.0 - (blinkCycle - 3.7) / 0.15 : blinkCycle > 3.55 ? (blinkCycle - 3.55) / 0.15 : 1.0;
      const eyeGaze = Math.sin(elapsed * 0.3) * 0.04;
      const eyeGazeY = Math.cos(elapsed * 0.22) * 0.02;

      for (let i = 0; i < eyeCount; i++) {
        const baseX = i === 0 ? -0.32 : 0.32;
        eyePosAttr.setXYZ(i, baseX + eyeGaze, 0.22 + eyeGazeY, 0.6);
        const eyeIntensity = statusRef.current === 'recording'
          ? 0.7 + mic * 0.5 + recPulse * 0.15
          : 0.4 + breatheMix * 0.25;
        eyeAlphaAttr.setX(i, eyeIntensity * blink);
        eyeSizeAttr.setX(i, statusRef.current === 'recording'
          ? 0.07 + mic * 0.04 + recPulse * mic * 0.02
          : 0.055 + breatheMix * 0.015);
        eyeColorAttr.setXYZ(i, currentPalette.core.r, currentPalette.core.g, currentPalette.core.b);
      }
      eyePosAttr.needsUpdate = true;
      eyeAlphaAttr.needsUpdate = true;
      eyeSizeAttr.needsUpdate = true;
      eyeColorAttr.needsUpdate = true;

      /* update abstract face — waveform mouth */
      const mPosAttr = mouthGeometry.getAttribute('position') as THREE.BufferAttribute;
      const mAlphaAttr = mouthGeometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const mSizeAttr = mouthGeometry.getAttribute('aSize') as THREE.BufferAttribute;
      const mColorAttr = mouthGeometry.getAttribute('aColor') as THREE.BufferAttribute;

      for (let i = 0; i < mouthSegments; i++) {
        const t = i / (mouthSegments - 1);
        const baseX = (t - 0.5) * 0.7;
        // waveform: animates with voice, gentle sine when idle
        let waveY: number;
        if (statusRef.current === 'recording' && mic > 0.05) {
          // voice-reactive waveform — multi-freq for organic look
          waveY = Math.sin(t * Math.PI * 4 + elapsed * 12) * mic * 0.08
            + Math.sin(t * Math.PI * 7 + elapsed * 18) * mic * 0.04
            + Math.sin(t * Math.PI * 2 + elapsed * 6) * mic * 0.05;
        } else {
          // gentle idle smile curve
          const smileArc = Math.sin(t * Math.PI) * 0.02 * (1 + breatheMix * 0.5);
          waveY = -smileArc + Math.sin(t * Math.PI * 3 + elapsed * 1.5) * 0.008;
        }
        mPosAttr.setXYZ(i, baseX, -0.18 + waveY, 0.6);

        const mouthIntensity = statusRef.current === 'recording'
          ? 0.4 + mic * 0.6
          : 0.2 + breatheMix * 0.15;
        mAlphaAttr.setX(i, mouthIntensity);
        mSizeAttr.setX(i, statusRef.current === 'recording'
          ? 0.02 + mic * 0.018
          : 0.015 + breatheMix * 0.005);
        mColorAttr.setXYZ(i, currentPalette.mid.r, currentPalette.mid.g, currentPalette.mid.b);
      }
      mPosAttr.needsUpdate = true;
      mAlphaAttr.needsUpdate = true;
      mSizeAttr.needsUpdate = true;
      mColorAttr.needsUpdate = true;

      /* update spine ribbons — always gently visible */
      spines.forEach(({ line, material }, si) => {
        material.color.copy(si % 2 === 0 ? currentPalette.mid : currentPalette.outer);
        material.opacity = 0.04 + breatheMix * 0.04 + formation * 0.08 + mic * 0.05;
        line.rotation.y = elapsed * (0.05 + si * 0.01 + mic * 0.06);
        line.rotation.z = Math.sin(elapsed * 0.28 + si * 0.7) * (0.06 + breatheMix * 0.02 + mic * 0.08);
        line.scale.setScalar(0.88 + breatheMix * 0.06 + formation * 0.22 + mic * 0.14);
      });

      /* update lighting — warm idle glow, blazing on recording */
      innerGlow.color.copy(currentPalette.glow);
      innerGlow.intensity = 4.0 + currentPalette.breath * 2.5 + breatheMix * 2.0 + mic * 8.0;
      rimLight.color.copy(currentPalette.outer);
      rimLight.intensity = 1.2 + mic * 3.5;

      /* group rotation – gentle idle sway, epic spin on recording */
      const rotSpeed = statusRef.current === 'recording' ? 0.07 + mic * 0.14 : 0.035;
      orbGroup.rotation.y = elapsed * rotSpeed;
      orbGroup.rotation.x = Math.sin(elapsed * 0.22) * (0.035 + mic * 0.05);
      const scaleBase = statusRef.current === 'recording'
        ? 1.0 + breathe * 0.03 + mic * 0.14 + recPulse * mic * 0.07
        : 0.97 + breatheMix * 0.04 + breathe2 * 0.015;
      orbGroup.scale.setScalar(scaleBase);

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      nebulaGeometry.dispose();
      nebulaMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      spines.forEach(({ line }) => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      coreSphereGeo.dispose();
      coreSphereMat.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      streakGeometry.dispose();
      streakMaterial.dispose();
      eyeGeometry.dispose();
      eyeMaterial.dispose();
      mouthGeometry.dispose();
      mouthMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} style={sceneStyle} aria-hidden="true" />;
};

const sceneStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: '180px',
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none'
};
