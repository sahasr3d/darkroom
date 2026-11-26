/**
 * The three GPU passes. All spatial quantities are in normalised image units so the live
 * viewfinder and the native-resolution export look identical.
 *
 *   source ─▶ [Pass 1 optics] ─▶ FBO A (mipmapped) ─▶ [Pass 2 film] ─▶ FBO B ─▶ [Pass 3 analog] ─▶ canvas
 */

export const VERTEX_SRC = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;   // image space, origin top-left
out vec2 vTex;  // framebuffer texture space, origin bottom-left
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  vTex = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const COMMON = /* glsl */ `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float PI = 3.14159265;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`

// ---------------------------------------------------------------------------
export const OPTICS_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vTex;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform vec2 uRes;
uniform vec4 uSrcRect;
uniform float uSeed;
uniform float uZoom;
uniform float uBarrel;
uniform float uFisheye;
uniform float uCA;
uniform float uSoftEdge;
uniform float uPrism;
uniform float uPrismMode;
uniform float uPrismSegments;
uniform float uStar;
uniform float uStarPoints;
uniform float uStarThreshold;
uniform float uStarLength;
uniform float uMotionBlur;
uniform float uMotionAngle;
uniform vec2 uFocusPoint;
uniform float uDof;
uniform sampler2D uTex2;
uniform vec4 uSrcRect2;
uniform float uDouble;
uniform float uBlendMode;
uniform float uBlendBalance;
uniform float uParallax;
uniform float uStarAngle;
${COMMON}

float aspect() { return uRes.x / uRes.y; }

// Pseudo-depth for D3D wiggle views: lower in frame and darker = nearer; bright sky = far.
// Read from a heavily blurred mip so the displacement field is smooth.
float pseudoDepth(vec2 uv) {
  float lum = dot(textureLod(uTex, uSrcRect.xy + clamp(uv, 0.0, 1.0) * uSrcRect.zw, 5.0).rgb, LUMA);
  return clamp(0.7 * uv.y + 0.3 * (1.0 - lum), 0.0, 1.0) - 0.5;
}

// Output uv -> source uv through zoom, fisheye and barrel. Corners stay pinned to corners.
vec2 lensWarp(vec2 uv) {
  float asp = aspect();
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  float diag = length(vec2(asp, 1.0) * 0.5);
  vec2 pn = p / diag;
  float r = length(pn);
  float scale = 1.0;
  if (uFisheye > 0.001) {
    float a = clamp(uFisheye, 0.0, 1.0) * 1.32;
    scale *= (r > 1e-4) ? (tan(r * a) / tan(a)) / r : (a / tan(a));
  }
  float rb = r * scale;
  scale *= (1.0 + uBarrel * rb * rb) / (1.0 + uBarrel);
  vec2 q = pn * scale * diag / max(uZoom, 1.0);
  return q / vec2(asp, 1.0) + 0.5;
}

vec2 toSrc(vec2 uv) { return uSrcRect.xy + clamp(uv, 0.0, 1.0) * uSrcRect.zw; }

// Plastic-lens softness grows toward the frame edge; tap-to-focus depth of field grows away
// from the focus point. Both sample a blurrier mip rather than looping.
vec3 lensSample(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
  float lod = uSoftEdge * dot(d, d) * 9.0;
  if (uDof > 0.001) {
    vec2 f = (uv - uFocusPoint) * vec2(aspect(), 1.0);
    lod += uDof * smoothstep(0.02, 0.5, dot(f, f)) * 4.5;
  }
  return textureLod(uTex, toSrc(uv), lod).rgb;
}

vec3 blendExposures(vec3 a, vec3 b) {
  float wA = min(1.0, 2.0 * (1.0 - uBlendBalance));
  float wB = min(1.0, 2.0 * uBlendBalance);
  vec3 ea = a * wA;
  vec3 eb = b * wB;
  if (uBlendMode < 0.5) return 1.0 - (1.0 - ea) * (1.0 - eb);
  if (uBlendMode < 1.5) return max(ea, eb);
  vec3 lo = 2.0 * a * b;
  vec3 hi = 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  vec3 ov = mix(lo, hi, step(0.5, a));
  return mix(ea, ov, wB);
}

vec3 opticalSample(vec2 suv) {
  vec2 dir = suv - 0.5;
  if (uCA < 0.0001) return lensSample(suv);
  float k = uCA * dot(dir, dir) * 0.09;
  return vec3(lensSample(0.5 + dir * (1.0 + k)).r, lensSample(suv).g, lensSample(0.5 + dir * (1.0 - k)).b);
}

// Prism attachment: split-image ghosts (mode 1) or an N-fold kaleidoscope (mode 2).
vec2 prismUv(vec2 uv, out float ghost) {
  ghost = 0.0;
  if (uPrismMode > 1.5) {
    float asp = aspect();
    vec2 p = (uv - 0.5) * vec2(asp, 1.0);
    // Multi-facet prism: each facet shows the whole scene displaced outward along its
    // facet direction, around a clear central copy.
    float seg = 2.0 * PI / max(uPrismSegments, 2.0);
    float facet = floor(atan(p.y, p.x) / seg + 0.5) * seg;
    vec2 dir = vec2(cos(facet), sin(facet));
    ghost = smoothstep(0.1, 0.2, length(p));
    vec2 q = (p - dir * 0.3) / 0.82;
    return q / vec2(asp, 1.0) + 0.5;
  }
  float side = uv.x < 0.5 ? -1.0 : 1.0;
  ghost = smoothstep(0.2, 0.36, abs(uv.x - 0.5));
  return uv + vec2(side * 0.21, 0.015 * side);
}

void main() {
  vec2 suv = lensWarp(vUv);
  if (abs(uParallax) > 0.0001) suv.x += uParallax * pseudoDepth(suv) / aspect();
  vec3 col;
  // Slow-shutter hand shake: average along the shake direction (centred on the frame).
  if (uMotionBlur > 0.0001) {
    vec2 dir = vec2(cos(uMotionAngle) / aspect(), sin(uMotionAngle)) * uMotionBlur;
    col = vec3(0.0);
    for (int i = -4; i <= 4; i++) col += opticalSample(suv + dir * (float(i) / 4.0));
    col /= 9.0;
  } else {
    col = opticalSample(suv);
  }

  // Double exposure: the second frame goes through the same lens and is blended on film.
  if (uDouble > 0.5) {
    vec3 second = textureLod(uTex2, uSrcRect2.xy + clamp(suv, 0.0, 1.0) * uSrcRect2.zw, 0.0).rgb;
    col = blendExposures(col, second);
  }

  if (uPrism > 0.001) {
    float ghost;
    vec2 puv = prismUv(suv, ghost);
    vec3 pc = opticalSample(puv);
    if (uPrismMode > 1.5) col = mix(col, pc, uPrism * ghost * 0.88);
    else col = mix(col, max(col, pc * 0.92), ghost * uPrism * 0.85);
  }

  // Starburst filter: each spoke carries the strongest diffracted highlight along it (max, not
  // sum), so point lights grow crisp rays while broad bright areas don't bloom into a wash.
  if (uStar > 0.001) {
    vec3 acc = vec3(0.0);
    float thr = min(uStarThreshold, 0.99);
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uStarPoints) break;
      float ang = float(i) * PI * 2.0 / uStarPoints + uStarAngle;
      vec2 dir = vec2(cos(ang) / aspect(), sin(ang));
      vec3 spoke = vec3(0.0);
      for (int j = 1; j <= 20; j++) {
        float t = float(j) / 20.0;
        vec3 c = textureLod(uTex, toSrc(suv - dir * t * uStarLength), 0.6).rgb;
        float b = max(dot(c, LUMA) - thr, 0.0) / (1.0 - thr);
        spoke = max(spoke, c * b * (1.0 - t) * (1.0 - t));
      }
      acc += spoke;
    }
    col += acc * uStar * 0.45;
  }

  outColor = vec4(col, 1.0);
}`

// ---------------------------------------------------------------------------
export const FILM_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
in vec2 vTex;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uSeed;
uniform float uTime;
uniform mat3 uColorMatrix;
uniform vec3 uColorOffset;
uniform float uExposure;
uniform float uNd;
uniform float uLutMix;
uniform sampler3D uLut;   // unit 2; a 2x2x2 identity cube when no grade is loaded
uniform float uLutSize;
uniform vec3 uLutMin;
uniform vec3 uLutMax;
uniform vec3 uWbGain;
uniform vec3 uGain;
uniform float uContrast;
uniform float uSaturation;
uniform float uLift;
uniform float uRolloff;
uniform float uClip;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uHalation;
uniform vec3 uHalColor;
uniform float uHalRadius;
uniform float uHalThreshold;
uniform float uSharpen;
uniform float uGrain;
uniform float uGrainSize;
uniform float uIsoNoise;
uniform float uFlash;
uniform vec3 uFlashGel;
uniform float uLeak;
uniform vec2 uLeakPos;
uniform vec3 uLeakColor;
uniform float uLeakSpread;
uniform float uVignette;
uniform float uNight;
uniform float uFlicker;
${COMMON}

void main() {
  float asp = uRes.x / uRes.y;
  vec3 col = texture(uTex, vTex).rgb;

  if (uSharpen > 0.001) {
    vec2 px = max(1.0 / uRes, vec2(1.0 / 1400.0 / asp, 1.0 / 1400.0));
    vec3 blur = (texture(uTex, vTex + vec2(px.x, 0.0)).rgb + texture(uTex, vTex - vec2(px.x, 0.0)).rgb +
                 texture(uTex, vTex + vec2(0.0, px.y)).rgb + texture(uTex, vTex - vec2(0.0, px.y)).rgb) * 0.25;
    col += (col - blur) * uSharpen * 2.2;
  }

  if (uNight > 0.001) {
    float ir = pow(clamp(dot(col, LUMA) * 1.55 + 0.06, 0.0, 1.0), 0.8);
    col = mix(col, vec3(ir) * vec3(0.78, 1.0, 0.86), uNight);
  }

  // Colour science: white balance -> body matrix -> exposure (EV minus ND stops).
  col *= uWbGain;
  col = max(uColorMatrix * col + uColorOffset, 0.0);
  col *= exp2(uExposure - uNd) * uGain;
  // Projector / cheap-shutter flicker: each frame lands a little brighter or darker.
  if (uFlicker > 0.001) col *= 1.0 + uFlicker * (hash12(vec2(floor(uTime * 24.0), uSeed + 3.0)) - 0.5) * 0.35;

  // Custom grade: map into the cube's domain, then scale/offset by half a texel so 0 and 1 land
  // on the first and last lattice points instead of the texture edges.
  if (uLutMix > 0.001) {
    vec3 lu = clamp((col - uLutMin) / max(uLutMax - uLutMin, vec3(1e-5)), 0.0, 1.0);
    vec3 lc = lu * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
    col = mix(col, texture(uLut, lc).rgb, uLutMix);
  }

  vec2 ap = (vUv - 0.5) * vec2(asp, 1.0);
  float rad = length(ap) / length(vec2(asp, 1.0) * 0.5);

  // Direct flash: hot centre, fast falloff, tinted by the gel.
  if (uFlash > 0.001) {
    float f = exp(-rad * rad * 3.2);
    col *= mix(vec3(1.0), (0.5 + f * 0.95) * mix(vec3(1.0), uFlashGel, 0.8), uFlash);
  }

  // Tone curve.
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, LUMA);
  col = mix(vec3(l), col, uSaturation);
  float ws = 1.0 - smoothstep(0.0, 0.55, l);
  float wh = smoothstep(0.45, 1.0, l);
  col += uShadowTint * ws + uHighTint * wh;
  col = max(col, 0.0);
  vec3 soft = (1.0 - exp(-col * 2.2)) / (1.0 - exp(-2.2));
  col = mix(col, soft, uRolloff);
  // CCD clipping: highlights slam into flat white instead of rolling off.
  col = mix(col, clamp((col - 0.5) * 1.18 + 0.52, 0.0, 1.0), uClip);
  col = col * (1.0 - uLift) + uLift * vec3(1.0, 0.985, 0.96);

  // Halation from the optics pass's mip chain.
  if (uHalation > 0.001) {
    float lod = log2(max(uRes.y * uHalRadius * 0.6, 1.0));
    float thr = min(uHalThreshold, 0.99);
    vec3 hal = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 o = vec2(cos(a) / asp, sin(a));
      for (int j = 1; j <= 2; j++) {
        vec3 c = textureLod(uTex, vTex + o * uHalRadius * float(j) * 0.55, lod).rgb;
        float b = max(dot(c, LUMA) - thr, 0.0) / (1.0 - thr);
        hal += c * b;
      }
    }
    vec3 center = textureLod(uTex, vTex, lod).rgb;
    float bc = max(dot(center, LUMA) - thr, 0.0) / (1.0 - thr);
    hal = (hal / 24.0) * 0.7 + center * bc * 0.5;
    col += uHalColor * dot(hal, vec3(0.45, 0.4, 0.15)) * uHalation * 2.6;
  }

  if (uLeak > 0.001) {
    vec2 lp = (uLeakPos - 0.5) * vec2(asp, 1.0);
    float d = length((ap - lp) * vec2(0.7, 1.0));
    float body = exp(-d * d / max(uLeakSpread * uLeakSpread, 1e-3));
    float streak = exp(-pow(abs(ap.x - lp.x * 0.92), 2.0) / (uLeakSpread * 0.08)) * 0.55;
    float leak = clamp((body + streak * body * 2.0) * uLeak, 0.0, 1.0);
    col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - uLeakColor * leak);
  }

  float vig = 1.0 - smoothstep(0.25, 1.15, rad);
  col *= mix(1.0, vig, uVignette);

  float lumG = clamp(dot(col, LUMA), 0.0, 1.0);
  if (uGrain > 0.001) {
    vec2 gp = vUv * vec2(asp, 1.0) * (1100.0 / uGrainSize) + uSeed * 0.013;
    float g = valueNoise(gp) * 0.65 + valueNoise(gp * 2.07 + 17.0) * 0.35 - 0.5;
    vec3 gc = vec3(g) + (hash32(floor(gp)) - 0.5) * 0.12;
    col += gc * uGrain * (0.25 + 3.0 * lumG * (1.0 - lumG)) * 0.32;
  }
  if (uIsoNoise > 0.001) {
    vec2 cell = floor(vUv * vec2(asp, 1.0) * 1080.0);
    vec3 n = hash32(cell + fract(uTime * 7.0) * 311.0 + uSeed) - 0.5;
    float m = hash12(cell * 1.7 + uSeed) - 0.5;
    col += (n * 0.65 + m * 0.6) * uIsoNoise * (1.15 - lumG) * 0.34;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

// ---------------------------------------------------------------------------
export const ANALOG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vTex;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uSeed;
uniform float uTime;
uniform float uChromaBlur;
uniform float uScanlines;
uniform float uScanCount;
uniform float uStatic;
uniform float uGateWeave;
${COMMON}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 t = vTex;
  float frame = floor(uTime * 24.0);

  // 8mm/16mm gate weave: the whole frame drifts and jumps a little every frame.
  if (uGateWeave > 0.001) {
    vec2 drift = vec2(sin(uTime * 1.7) * 0.6 + (hash12(vec2(frame, 3.0)) - 0.5), cos(uTime * 1.3) * 0.4 + (hash12(vec2(frame, 7.0)) - 0.5) * 1.6);
    t += drift * uGateWeave * 0.0045;
  }

  // Horizontal sync jitter.
  float row = floor(vUv.y * uScanCount * 0.5);
  float band = smoothstep(0.985, 1.0, sin(vUv.y * 7.0 - uTime * 2.3) * 0.5 + 0.5);
  if (uStatic > 0.001) {
    float tear = hash12(vec2(row, frame + uSeed));
    t.x += uStatic * (tear - 0.5) * (0.0025 + band * 0.012);
  }

  vec3 col = texture(uTex, t).rgb;
  // Out-of-gate area turns black, like the edge of a projected frame.
  if (any(lessThan(t, vec2(0.0))) || any(greaterThan(t, vec2(1.0)))) col = vec3(0.0);

  // Chroma subsampling / bleed: keep luma sharp, smear colour sideways.
  if (uChromaBlur > 0.001) {
    float y = dot(col, LUMA);
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = -4; i <= 4; i++) {
      float fi = float(i);
      float w = exp(-fi * fi / 8.0);
      acc += texture(uTex, t + vec2((fi + 1.5) * uChromaBlur * 0.0045, 0.0)).rgb * w;
      wsum += w;
    }
    acc /= wsum;
    col = clamp(vec3(y) + (acc - dot(acc, LUMA)) * (1.0 - uChromaBlur * 0.25), 0.0, 1.0);
  }

  if (uScanlines > 0.001) {
    float line = 0.5 + 0.5 * sin(vUv.y * uScanCount * PI);
    float field = mod(floor(vUv.y * uScanCount), 2.0);
    col *= 1.0 - uScanlines * (0.38 * (1.0 - line) + 0.08 * field);
  }
  if (uStatic > 0.001) {
    float snow = hash12(floor(vUv * vec2(asp * 420.0, uScanCount)) + floor(uTime * 30.0) * 7.31 + uSeed);
    float bandLine = step(0.992, hash12(vec2(row, floor(uTime * 12.0))));
    col = mix(col, vec3(snow), uStatic * (0.05 + band * 0.32 + bandLine * 0.35));
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
