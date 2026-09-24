// All GLSL for the lo-fi rooftop. Nothing here is a texture or a model —
// every pixel of the "painting" is generated in the fragment shader.

/* ------------------------------------------------------------------ */
/* shared chunks                                                       */
/* ------------------------------------------------------------------ */

export const COMMON = /* glsl */ `
#define PI 3.14159265359

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }

float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*0.1031);
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<OCTAVES;i++){ s += a*vnoise(p); p = p*2.03 + vec2(11.3,7.7); a *= 0.5; }
  return s;
}

float rectMask(vec2 q, vec2 lo, vec2 hi, float aa){
  vec2 a = smoothstep(lo-aa, lo+aa, q);
  vec2 b = smoothstep(hi+aa, hi-aa, q);
  return a.x*a.y*b.x*b.y;
}

// short pulse once per period, phase-shifted per seed
float blink(float t, float speed, float seed, float on){
  float f = fract(t*speed + seed);
  return smoothstep(0.01, 0.035, f) * smoothstep(on+0.04, on, f);
}
`;

// Uniforms every painted layer shares. Lights live twice: once as world
// positions (for the real geometry) and once projected into the painting's
// own space (for the flat layers) — that is what lets one light wash across
// both halves of the render and still look like the same light.
export const SCENE_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uHorizon;
uniform vec2  uSun;
uniform vec2  uLightQ[3];
uniform vec3  uLightC[3];
uniform float uLightI[3];
uniform float uLightR[3];
`;

export const SKY_FN = /* glsl */ `
vec3 skyColor(vec2 q){
  float h = q.y - uHorizon;
  vec3 zen = vec3(0.045,0.062,0.135);
  vec3 mid = vec3(0.150,0.132,0.250);
  vec3 low = vec3(0.400,0.250,0.285);
  vec3 hor = vec3(0.880,0.520,0.335);

  float t = clamp(h*0.80, 0.0, 1.6);
  vec3 c = mix(hor, low, smoothstep(0.0, 0.14, t));
  c = mix(c, mid, smoothstep(0.09, 0.44, t));
  c = mix(c, zen, smoothstep(0.36, 1.10, t));
  c = mix(c, c*0.52, smoothstep(0.0, -0.30, h));

  float d = length((q - uSun)*vec2(0.72, 1.55));
  c += vec3(1.00,0.60,0.33)*exp(-d*2.4)*0.50;
  c += vec3(1.00,0.84,0.60)*exp(-d*10.0)*0.80;
  return c;
}
`;

// One band of buildings: silhouette, lit windows, and the red beacon on the
// tall ones. x = coverage, y = window light, z = beacon.
export const CITY_FN = /* glsl */ `
vec3 cityRow(vec2 q, float baseY, float colW, float seed, float amp, float winDens, float mastCut){
  float ci = floor(q.x/colW);
  float r1 = hash21(vec2(ci, seed));
  float r2 = hash21(vec2(ci, seed+13.1));
  float r3 = hash21(vec2(ci, seed+37.7));

  float gap = colW*0.05;
  float x0  = ci*colW + gap;
  float x1  = (ci+1.0)*colW - gap;
  float cx  = (x0+x1)*0.5;
  float h   = baseY + amp*(0.16 + 0.84*r1*r1);
  float aa  = max(fwidth(q.x), fwidth(q.y))*0.85 + 1e-5;

  float m = rectMask(q, vec2(x0, baseY-6.0), vec2(x1, h), aa);

  // setback block on some towers
  float sb = step(0.60, r2);
  float sw = colW*mix(0.62, 0.34, r3);
  float sh = amp*0.18*r3;
  m = max(m, sb*rectMask(q, vec2(cx-sw*0.5, h-aa), vec2(cx+sw*0.5, h+sh), aa));
  float topY = h + sb*sh;

  // antenna mast
  float mast = step(mastCut, r3);
  float mh = amp*0.26*(0.4+r2);
  m = max(m, mast*rectMask(q, vec2(cx-colW*0.011, topY-aa), vec2(cx+colW*0.011, topY+mh), aa));
  topY += mast*mh;

  // windows
  vec2 cs = vec2(colW*0.235, colW*0.185);
  vec2 g  = (q - vec2(x0 + cs.x*0.35, baseY + cs.y*0.5))/cs;
  vec2 gi = floor(g), gf = fract(g);
  float wr = hash21(gi + vec2(ci*7.3, seed*2.7));
  float on = step(1.0-winDens, wr);
  on *= step(0.10, fract(wr*13.37 + uTime*0.010));          // a few switch off over minutes
  float flick = 0.84 + 0.16*sin(uTime*(0.5+wr*1.6) + wr*63.0);
  float shape = rectMask(gf, vec2(0.14,0.18), vec2(0.70,0.72), 0.07);
  float px  = max(fwidth(g.x), fwidth(g.y));
  float rez = smoothstep(0.80, 0.28, px);                    // fade out when subpixel
  float body = rectMask(q, vec2(x0+cs.x*0.30, baseY+cs.y*0.4), vec2(x1-cs.x*0.30, h-cs.y*0.7), aa);
  float win  = on*shape*flick*rez*body;
  win += winDens*0.20*(1.0-rez)*body;                        // ...into an even glow instead

  // aircraft beacon on anything tall
  float tall = smoothstep(baseY+amp*0.62, baseY+amp*0.80, h);
  vec2  bp = vec2(cx, topY + colW*0.05);
  float bd = length((q-bp)/vec2(colW*0.085));
  float bec = tall*exp(-bd*bd*1.4)*blink(uTime, 0.26, r1*7.0, 0.10);

  return vec3(m, win, bec);
}
`;

/* ------------------------------------------------------------------ */
/* camera mapping                                                      */
/* ------------------------------------------------------------------ */

// The painted layers are sampled in the projector camera's clip space, not in
// their own UVs. The content is therefore pinned to one fixed point of view —
// the "painting" — while the render camera is free to move. Every layer sits
// at a different depth, so moving the camera shears them against each other:
// that is the parallax, and it costs nothing but this matrix multiply.
export const LAYER_VERT = /* glsl */ `
uniform mat4  uProjMat;
uniform float uCameraMap;
uniform float uProjAspect;
uniform vec2  uMargin;
varying vec2  vQ;
varying vec2  vUvL;
varying vec3  vWorld;

void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld  = wp.xyz;
  vUvL    = uv;

  vec4 pj = uProjMat * wp;
  vec2 mapped = pj.xy / max(pj.w, 1e-4);      // projector clip space
  vec2 plain  = (uv*2.0 - 1.0) * uMargin;     // same scale, but nailed to the plane
  vQ = mix(plain, mapped, uCameraMap);
  vQ.x *= uProjAspect;

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Thin border, only visible in the exploded view, so the stack of cards reads
// as a stack of cards.
export const EDGE_FN = /* glsl */ `
uniform float uEdge;
varying vec2  vUvL;
float cardEdge(){
  vec2 d = min(vUvL, 1.0 - vUvL);
  return smoothstep(0.0035, 0.0, min(d.x, d.y)) * uEdge;
}
`;

/* ------------------------------------------------------------------ */
/* sky                                                                 */
/* ------------------------------------------------------------------ */

export const SKY_FRAG = /* glsl */ `
${COMMON}
${SCENE_UNIFORMS}
${SKY_FN}
${EDGE_FN}
varying vec2 vQ;
varying vec3 vWorld;

void main(){
  vec2 q = vQ;
  vec3 c = skyColor(q);
  float h = q.y - uHorizon;

  // stratus bands, drifting slowly enough that you notice only if you stay
  vec2 cp = vec2(q.x*0.42 + uTime*0.0055, h*1.55);
  float n1 = fbm(cp*1.45);
  float n2 = fbm(cp*0.62 + vec2(uTime*0.0022, 0.0));
  float cloud = smoothstep(0.46, 0.78, n1*0.62 + n2*0.48);
  cloud *= smoothstep(-0.02, 0.30, h) * smoothstep(1.35, 0.45, h);

  float lit = exp(-length((q-uSun)*vec2(0.50,1.15))*1.05);
  vec3 cc = mix(vec3(0.105,0.100,0.170), vec3(0.98,0.62,0.42), lit*0.92);
  c = mix(c, cc, cloud*0.72);

  // stars, only once the sky is dark enough to hold them
  vec2 sc = floor(q*150.0);
  float sp = hash21(sc);
  float star = step(0.9972, sp)*smoothstep(0.30, 1.05, h);
  c += vec3(0.72,0.80,1.0)*star*(0.45+0.55*sin(uTime*1.7 + sp*90.0));

  c += vec3(0.95,0.72,0.45)*cardEdge();
  gl_FragColor = vec4(c, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* city layers                                                         */
/* ------------------------------------------------------------------ */

export const CITY_FRAG = /* glsl */ `
${COMMON}
${SCENE_UNIFORMS}
${SKY_FN}
${CITY_FN}
${EDGE_FN}
uniform float uBaseY;
uniform float uColW;
uniform float uSeed;
uniform float uAmp;
uniform float uWinDens;
uniform float uMastCut;
uniform float uHaze;
uniform vec3  uSilhouette;
uniform vec3  uWinColor;
uniform vec2  uRimDir;
uniform vec3  uRimCol;
uniform float uRimW;
uniform float uRim;
uniform float uWash;
varying vec2  vQ;
varying vec3  vWorld;

void main(){
  vec2 q = vQ;

  vec3 back  = cityRow(q, uBaseY+uAmp*0.02, uColW*1.55, uSeed+91.7, uAmp*0.62, uWinDens*0.55, 0.95);
  vec3 front = cityRow(q, uBaseY,           uColW,      uSeed,      uAmp,      uWinDens,      uMastCut);

  float cover  = max(back.x, front.x);
  float lights = back.z + front.z;
  float border = cardEdge();
  if(cover < 0.004 && lights < 0.004 && border < 0.004) discard;   // most of this plane is sky — bail before the expensive part

  vec3 sky = skyColor(q);
  vec3 bodyF = mix(uSilhouette, sky, uHaze);
  vec3 bodyB = mix(uSilhouette*1.30, sky, clamp(uHaze*1.5, 0.0, 0.96));

  vec3 col = bodyB;
  col = mix(col, bodyF, front.x);
  float alpha = cover;

  col += uWinColor*(back.y*0.5*(1.0-front.x) + front.y);

  // A flat layer has no normal, so the light-facing edge is found by sampling
  // the silhouette again, shifted towards the light: what is inside the
  // building but outside the shifted copy is the strip the light catches.
  // Two shifts instead of one turn that strip into a falloff.
  vec3 s1 = cityRow(q + uRimDir*uRimW,       uBaseY, uColW, uSeed, uAmp, 0.0, uMastCut);
  vec3 s2 = cityRow(q + uRimDir*uRimW*2.6,   uBaseY, uColW, uSeed, uAmp, 0.0, uMastCut);
  float rim = clamp(front.x - s1.x, 0.0, 1.0)*0.62 + clamp(front.x - s2.x, 0.0, 1.0)*0.38;
  col += uRimCol*rim*uRim;

  for(int i=0;i<3;i++){
    vec2 L = uLightQ[i] - q;
    float dl = length(L);
    float fall = uLightI[i]*exp(-dl/uLightR[i]);
    col += uLightC[i]*fall*alpha*uWash;
  }

  col += vec3(1.00,0.13,0.09)*lights*2.2;
  alpha = clamp(alpha + lights*0.9, 0.0, 1.0);

  col += vec3(0.95,0.72,0.45)*border;
  alpha = max(alpha, border);

  gl_FragColor = vec4(col, alpha);
}
`;

/* ------------------------------------------------------------------ */
/* foreground: out-of-focus string lights + a dark leaf mass           */
/* ------------------------------------------------------------------ */

export const FORE_FRAG = /* glsl */ `
${COMMON}
${SCENE_UNIFORMS}
${EDGE_FN}
uniform float uProjAspect;
varying vec2 vQ;
varying vec3 vWorld;

// blurred blob — the whole foreground is out of focus, so nothing has an edge
float blob(vec2 p, float r, float soft){
  return smoothstep(r, r*(1.0-soft), length(p));
}

void main(){
  vec2 q = vQ;
  float A = uProjAspect;
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // A slack cable of bulbs strung over the roof, close enough to the lens to
  // be completely out of focus. It carries most of the parallax: it is the
  // only thing near enough for a small camera move to shift it a long way.
  float sway = sin(uTime*0.24)*0.022 + sin(uTime*0.41+1.3)*0.012;
  float xr = q.x/max(A, 0.35);
  float cable = 0.96 - 0.20*cos(xr*1.05) + sway*0.6;
  float line = smoothstep(0.020, 0.004, abs(q.y - cable));
  col = mix(col, vec3(0.028,0.030,0.044), line*0.85);
  alpha = max(alpha, line*0.85);

  for(int i=0;i<7;i++){
    float fi = float(i);
    float x = (-1.02 + fi*0.34)*A;
    float cy = 0.96 - 0.20*cos((x/max(A,0.35))*1.05) + sway*0.6;
    vec2 c = vec2(x + sway*(0.4+fi*0.05), cy - 0.085);
    float r = (0.070 + hash11(fi)*0.028)*max(A*0.62, 0.52);
    float b = blob(q-c, r, 1.0);
    float warm = 0.70 + 0.30*sin(uTime*(0.7+hash11(fi+3.0)) + fi*2.1);
    col += vec3(1.00,0.62,0.32)*b*b*warm*1.15;
    col += vec3(1.00,0.78,0.52)*blob(q-c, r*0.30, 1.0)*warm*1.0;
    col += vec3(1.00,0.55,0.28)*blob(q-c, r*2.6, 1.0)*warm*0.16;   // halo
    alpha = max(alpha, min(b*1.2, 1.0)*0.9);
    // the hanger, a hair of dark against the sky
    float hang = smoothstep(0.010, 0.002, abs(q.x - c.x))*smoothstep(0.0, -0.09, q.y - cy)*smoothstep(-0.10, -0.06, q.y - cy);
    col = mix(col, vec3(0.03,0.032,0.046), hang*0.7);
    alpha = max(alpha, hang*0.7);
  }

  float border = cardEdge();
  col += vec3(0.95,0.72,0.45)*border;
  alpha = max(alpha, border);

  gl_FragColor = vec4(col, alpha);
}
`;

/* ------------------------------------------------------------------ */
/* real geometry: one shared banded-light model                        */
/* ------------------------------------------------------------------ */

// The rooftop, the viaduct and the water tank are actual meshes with real
// normals. They are lit by the same three lights as the painted layers, but
// through a banded ramp instead of a smooth falloff — smooth shading is what
// makes hand-painted-looking scenes fall apart into CG.
export const GEO_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const GEO_FRAG = /* glsl */ `
${COMMON}
uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uBase;
uniform vec3  uSunDir;
uniform vec3  uSunCol;
uniform vec3  uSkyFill;
uniform vec3  uGroundFill;
uniform vec3  uFogColor;
uniform vec2  uFog;
uniform float uMottle;
uniform vec3  uLightP[2];
uniform vec3  uLightWC[2];
uniform float uLightWI[2];
uniform float uLightWR[2];
varying vec3  vWorld;
varying vec3  vNormal;

float band(float x){
  return smoothstep(0.00, 0.05, x)*0.42
       + smoothstep(0.18, 0.34, x)*0.34
       + smoothstep(0.50, 0.72, x)*0.24;
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);

  // the deck is a big flat surface and reads as plastic without some dirt
  vec3 base = uBase * (1.0 + uMottle*(fbm(vWorld.xz*0.42)-0.5)*0.55);
  base *= 1.0 - uMottle*0.22*smoothstep(0.35, 0.75, vnoise(vWorld.xz*0.09));

  vec3 col = base * mix(uGroundFill, uSkyFill, N.y*0.5+0.5);
  col += base * uSunCol * band(dot(N, uSunDir)) * 0.85;
  col += base * uSkyFill * max(N.y, 0.0) * 0.55;   // the sky is a big soft light

  // Fresnel on a floor is 1 everywhere you look, which floods the deck with
  // rim light. Weighting it away from up-facing normals keeps the rim on the
  // silhouettes, where it belongs.
  float upness = max(N.y, 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2) * (1.0 - upness*0.92);

  for(int i=0;i<2;i++){
    vec3 L = uLightP[i] - vWorld;
    float d = length(L);
    L /= max(d, 1e-4);
    float att = uLightWI[i]/(1.0 + (d*d)/(uLightWR[i]*uLightWR[i]));
    col += base * uLightWC[i] * band(dot(N, L)) * att * 1.7;
    col += uLightWC[i] * fres * att * max(dot(N, L)*0.5 + 0.5, 0.0) * 0.26;

    // the deck is damp: a stretched glint is the cheapest way to say so, and
    // it is the only thing that stops a flat roof reading as a flat roof
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 34.0) * att * uMottle;
    spec *= 0.25 + 0.75*smoothstep(0.32, 0.78, fbm(vWorld.xz*0.5 + 3.7));
    col += uLightWC[i] * spec * 1.5;
  }

  // a thin cool rim off the sky keeps silhouettes from going pure black
  col += uSkyFill * fres * 0.55;

  float f = smoothstep(uFog.x, uFog.y, length(uCamPos - vWorld));
  col = mix(col, uFogColor, f*0.72);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* neon sign — the scene's key light, and visibly the same object       */
/* ------------------------------------------------------------------ */

export const SIGN_FRAG = /* glsl */ `
${COMMON}
uniform float uTime;
uniform vec3  uNeon;
varying vec2  vUv;

void main(){
  vec2 p = vUv*2.0 - 1.0;

  float ring = abs(length(p*vec2(1.0,1.15)) - 0.46) - 0.030;
  float bar  = max(abs(p.y + 0.74) - 0.028, abs(p.x) - 0.52);
  float sd   = min(ring, bar);

  // tube dropout: one bad segment that stutters, like every real sign
  float seg = step(0.30, fract(atan(p.y, p.x)*0.159155 + 0.62));
  float stut = mix(1.0, 0.25 + 0.75*step(0.55, hash11(floor(uTime*11.0))), 1.0-seg);

  float f = 0.88 + 0.12*sin(uTime*2.3) + 0.05*sin(uTime*7.1);
  f *= mix(1.0, 0.55, step(0.985, hash11(floor(uTime*9.0)))); // rare full flicker
  f *= stut;

  float core = smoothstep(0.020, 0.0, sd);
  float glow = exp(-max(sd, 0.0)*11.0);

  vec3 col = uNeon*(core*1.55 + glow*0.70)*f;
  gl_FragColor = vec4(col, clamp(core + glow*0.55, 0.0, 1.0)*f);
}
`;

/* ------------------------------------------------------------------ */
/* the train — the scene's one scheduled event                          */
/* ------------------------------------------------------------------ */

export const TRAIN_FRAG = /* glsl */ `
${COMMON}
uniform float uTime;
uniform vec3  uWarm;
varying vec2  vUv;

void main(){
  vec2 p = vUv;
  float body = rectMask(p, vec2(0.005, 0.30), vec2(0.995, 0.86), 0.012);

  // carriages: a gap every unit, windows inside each
  float carr = fract(p.x*7.0);
  float gap  = smoothstep(0.965, 0.99, carr) + smoothstep(0.035, 0.01, carr);
  body *= 1.0 - clamp(gap, 0.0, 1.0);

  vec2 g = vec2(fract(p.x*84.0), p.y);
  float w = rectMask(vec2(g.x, g.y), vec2(0.22, 0.50), vec2(0.78, 0.78), 0.06);
  float lit = step(0.18, hash11(floor(p.x*84.0)));
  float win = w*lit*body;

  float head = smoothstep(0.02, 0.0, length((p-vec2(1.0,0.58))*vec2(0.55,1.0)) - 0.05);

  vec3 col = vec3(0.045,0.050,0.075)*body;
  col += uWarm*win*1.55;
  col += vec3(1.0,0.92,0.78)*head*2.4;
  col += uWarm*exp(-abs(p.y-0.58)*7.0)*body*0.18;

  float a = clamp(body + win*0.6 + head, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

/* ------------------------------------------------------------------ */
/* dust motes                                                          */
/* ------------------------------------------------------------------ */

export const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute vec3 aSeed;
varying float vLife;
void main(){
  vec3 p = position;
  float t = uTime*0.055 + aSeed.z*10.0;
  p.x += sin(t*1.7 + aSeed.x*9.0)*0.9 + t*0.30;
  p.y += cos(t*1.3 + aSeed.y*7.0)*0.55 + sin(t*0.6)*0.25;
  p.x = mod(p.x + 26.0, 52.0) - 26.0;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.0 + aSeed.x*4.5) * uPixelRatio * (14.0/max(-mv.z, 1.0));
  vLife = 0.35 + 0.65*(0.5+0.5*sin(t*2.4 + aSeed.y*20.0));
}
`;

export const MOTE_FRAG = /* glsl */ `
uniform vec3 uWarm;
varying float vLife;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.06, d);
  gl_FragColor = vec4(uWarm*vLife*1.4, a*vLife*0.5);
}
`;

/* ------------------------------------------------------------------ */
/* post: bloom + grade + grain                                         */
/* ------------------------------------------------------------------ */

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  gl_FragColor = vec4(c*smoothstep(uThreshold, uThreshold+0.45, l), 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(uTex, vUv).rgb*0.2270270270;
  c += texture2D(uTex, vUv + uDir*1.3846153846).rgb*0.3162162162;
  c += texture2D(uTex, vUv - uDir*1.3846153846).rgb*0.3162162162;
  c += texture2D(uTex, vUv + uDir*3.2307692308).rgb*0.0702702703;
  c += texture2D(uTex, vUv - uDir*3.2307692308).rgb*0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Grade and grain are where "lo-fi" actually lives. The grain is deliberately
// stepped to 12 fps: film grain that updates every frame reads as video noise,
// not as film.
export const POST_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uRes;
uniform float uTime;
uniform float uGrain;
uniform float uBloomAmt;
uniform float uVignette;
varying vec2  vUv;

vec3 gradeIt(vec3 c){
  // gentle S-curve, then split-tone: teal in the shadows, amber up top
  c = clamp(c, 0.0, 4.0);
  c = c/(1.0 + c*0.42);
  c = c*1.06;
  c = mix(vec3(dot(c, vec3(0.2126,0.7152,0.0722))), c, 0.88);
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c += vec3(-0.012, 0.010, 0.030)*(1.0 - smoothstep(0.0, 0.42, l));
  c += vec3( 0.038, 0.014,-0.020)*smoothstep(0.35, 1.0, l);
  c = (c - 0.5)*1.075 + 0.5 + 0.008;
  return c;
}

void main(){
  vec2 uv = vUv;

  // tape wobble — under a pixel, but it stops the frame feeling nailed down
  uv.x += sin(uv.y*38.0 + uTime*0.7)*0.00035 + sin(uTime*0.21)*0.00045;

  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  float ca = (0.0016 + 0.0042*r2);
  vec3 c;
  c.r = texture2D(uScene, uv + d*ca).r;
  c.g = texture2D(uScene, uv).g;
  c.b = texture2D(uScene, uv - d*ca).b;

  c += texture2D(uBloom, uv).rgb * uBloomAmt;
  c = gradeIt(c);

  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float tstep = floor(uTime*12.0);
  float n = hash21(gl_FragCoord.xy + vec2(tstep*17.3, tstep*7.1)) - 0.5;
  c += n*uGrain*(0.35 + 0.85*(1.0 - smoothstep(0.0, 0.55, l)));

  c *= 1.0 - uVignette*smoothstep(0.18, 0.78, r2);
  c *= 1.0 - 0.06*smoothstep(0.30, 0.50, abs(uv.y-0.5));

  // dither before the 8-bit wall, otherwise the sky bands
  c += (hash21(gl_FragCoord.xy*1.7 + tstep) - 0.5)*0.0035;

  gl_FragColor = vec4(c, 1.0);
}
`;
