/**
 * 票面 Shader。正面、背面、主券、副券共用同一套代码，用 uniform 和 #define 区分。
 * 光照是解析式的「摄影棚」环境（渐变天空 + 两块柔光箱），不需要 HDRI 资源：
 * 票倾斜时，柔光箱的反射在票面上移动，形成随角度变化的光泽。
 * 见 02-architecture §5.3。
 */

export const ticketVertexShader = /* glsl */ `
uniform float uCurl;      // 副券撕开时的卷曲程度
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vTangentW;
varying vec3 vBitangentW;

void main() {
  vUv = uv;
  vec3 p = position;
  // 以 x = 0（打孔线）为轴向外卷曲。背面几何体已经烘焙了绕 Y 轴 180° 的旋转，
  // 所以 position.x 在正反面都是票据坐标，normal.z = +1（正面）/ -1（背面）
  float side = normal.z >= 0.0 ? 1.0 : -1.0;
  float d = max(p.x, 0.0);
  p.z += uCurl * d * d;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vNormalW = normalize(m * vec3(-2.0 * uCurl * d * side, 0.0, side));
  vTangentW = normalize(m * (vec3(1.0, 0.0, 2.0 * uCurl * d) * side));
  vBitangentW = normalize(m * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ticketFragmentShader = /* glsl */ `
uniform sampler2D uAlbedo;
uniform sampler2D uMask;        // R = 镭射, G = 烫金, B = 打孔镂空
uniform vec2  uSizeMm;
uniform float uCornerRadius;    // mm
uniform float uRoughness;
uniform float uF0;
uniform float uFiber;           // 纸纤维法线强度
uniform float uAge;             // 岁月效果 0..1
uniform float uHolo;            // 镭射强度
uniform float uGlitter;         // 闪粉开关（T2 档关闭）
uniform float uMagnetic;        // 1 = 磁气涂层背面
uniform float uMirrorU;         // 背面：1 = 蒙版 / 圆角坐标需要水平翻转
uniform float uTearU;           // 打孔线位置（uv.x），< 0 表示没有副券
uniform float uTearSide;        // 0 = 整张, 1 = 主券（保留左侧）, -1 = 副券（保留右侧）
uniform float uTearAmp;         // 撕口锯齿幅度（mm）
uniform float uSeed;
uniform float uOpacity;
uniform vec3  uKeyDir;
uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vTangentW;
varying vec3 vBitangentW;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

// 纸纤维：拉长的噪声，近似纤维方向
float fiberHeight(vec2 mm) {
  return fbm(vec2(mm.x * 1.6, mm.y * 4.2)) * 0.6 + fbm(mm * 9.0) * 0.4;
}

float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float softbox(vec3 R, vec3 dir, vec2 halfSize, float rough) {
  vec3 d = normalize(dir);
  float facing = dot(R, d);
  if (facing <= 0.0) return 0.0;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), d));
  vec3 up = cross(d, right);
  vec2 q = vec2(dot(R, right), dot(R, up)) / facing;
  float blur = 0.015 + rough * rough * 0.9;
  vec2 e = smoothstep(halfSize + blur, halfSize - blur * 0.5, abs(q));
  return e.x * e.y / (1.0 + rough * 6.0);
}

vec3 studioEnv(vec3 R, float rough) {
  float up = R.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.03, 0.03, 0.035), vec3(0.32, 0.33, 0.37), smoothstep(0.1, 0.95, up));
  c += softbox(R, vec3(-0.45, 0.55, 0.70), vec2(0.42, 0.16), rough) * vec3(6.0, 5.8, 5.5);
  c += softbox(R, vec3(0.55, 0.05, 0.83), vec2(0.10, 0.50), rough) * vec3(2.6, 2.8, 3.2);
  return c;
}

vec3 fresnel(vec3 f0, float cosT) {
  return f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
}

void main() {
  // 背面平面绕 Y 轴转了 180°，uv 已经是从背面看的方向；
  // 但圆角、撕口要和正面对齐，所以换算回正面坐标
  vec2 frontUv = vec2(mix(vUv.x, 1.0 - vUv.x, uMirrorU), vUv.y);
  vec2 mm = frontUv * uSizeMm;

  // 圆角
  float sd = sdRoundRect(mm - uSizeMm * 0.5, uSizeMm * 0.5, uCornerRadius);
  if (sd > 0.0) discard;

  // 副券撕口：主券和副券用同一条锯齿线，边缘互补
  if (uTearU >= 0.0 && uTearSide != 0.0) {
    float n = fbm(vec2(mm.y * 0.9, uSeed)) * 2.0 - 1.0;
    n += (hash12(vec2(floor(mm.y * 3.0), uSeed)) - 0.5) * 0.5;
    float edgeMm = uTearU * uSizeMm.x + n * uTearAmp;
    if (uTearSide > 0.0 && mm.x > edgeMm) discard;
    if (uTearSide < 0.0 && mm.x <= edgeMm) discard;
  }

  vec2 texUv = vUv;
  vec4 mask = texture2D(uMask, vec2(frontUv.x, frontUv.y));
  if (mask.b > 0.5) discard; // 打孔

  vec3 albedo = texture2D(uAlbedo, texUv).rgb;
  float roughness = uRoughness;
  float f0 = uF0;

  if (uMagnetic > 0.5) {
    float streak = vnoise(vec2(mm.y * 6.0, mm.x * 0.25));
    albedo = vec3(0.022, 0.018, 0.015) * (0.85 + 0.3 * streak);
    roughness = 0.3;
    f0 = 0.05;
  }

  // 岁月：纸张泛黄，墨色变淡
  float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
  albedo = mix(albedo, albedo * vec3(1.0, 0.92, 0.74), uAge);
  albedo = mix(albedo, vec3(0.78, 0.72, 0.6), uAge * 0.55 * (1.0 - lum));

  // 法线：纸纤维
  vec3 N = normalize(vNormalW);
  vec3 T = normalize(vTangentW);
  vec3 B = normalize(vBitangentW);
  float e = 0.08;
  float h0 = fiberHeight(mm);
  vec2 grad = vec2(fiberHeight(mm + vec2(e, 0.0)) - h0, fiberHeight(mm + vec2(0.0, e)) - h0) / e;
  N = normalize(N - (T * grad.x + B * grad.y) * uFiber * 0.06);

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uKeyDir);
  vec3 R = reflect(-V, N);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float NdotL = max(dot(N, L), 0.0);

  // 纸张：漫反射 + 柔光箱高光
  vec3 diffuse = albedo * (0.42 + 0.78 * NdotL);
  vec3 spec = studioEnv(R, roughness) * fresnel(vec3(f0), NdotV);
  vec3 color = diffuse + spec;

  // 墨水区域（深色）不覆盖烫金 / 镭射：油墨印在箔上面
  float inkMask = smoothstep(0.22, 0.5, lum);

  // 镭射（衍射光栅的近似）：底色是银色金属，彩虹色带随视角和光源角度移动
  float holo = mask.r * inkMask * uHolo;
  if (holo > 0.001) {
    vec2 vt = vec2(dot(V, T), dot(V, B));
    vec2 lt = vec2(dot(L, T), dot(L, B));
    // 防伪图案：斜向色带 + 同心圆，让色相在票面上有结构地变化
    float rings = sin(length(mm - vec2(uSizeMm.x * 0.07, uSizeMm.y * 0.5)) * 0.9) * 0.06;
    float bands = floor(fract((mm.x + mm.y) * 0.16) * 2.0) * 0.08;
    float phase = (vt.x + lt.x) * 1.7 + (vt.y + lt.y) * 1.1
      + (mm.x * 0.6 + mm.y * 0.35) * 0.025 + fbm(mm * 0.35) * 0.25 + rings + bands;
    vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
    vec3 Rf = reflect(-V, normalize(vNormalW));
    vec3 envF = studioEnv(Rf, 0.2);
    float catchLight = clamp(dot(envF, vec3(0.333)), 0.0, 2.0);
    vec3 silver = vec3(0.6, 0.62, 0.66) * (0.28 + 0.55 * catchLight);
    float sat = 0.45 + 0.4 * clamp(catchLight, 0.0, 1.0);
    vec3 foil = mix(silver, silver * (0.35 + rainbow * 1.3), sat);
    foil += rainbow * pow(max(dot(Rf, L), 0.0), 8.0) * 0.35;
    // 闪粉：每个小格子有随机朝向，只在特定角度闪亮
    if (uGlitter > 0.5) {
      vec2 cell = floor(mm * 2.2);
      float rnd = hash12(cell + uSeed);
      vec3 cn = normalize(vNormalW + (T * (hash12(cell + 3.1) - 0.5) + B * (hash12(cell + 7.7) - 0.5)) * 0.9);
      float sparkle = pow(max(dot(reflect(-V, cn), L), 0.0), 260.0) * step(0.7, rnd);
      vec2 f = fract(mm * 2.2) - 0.5;
      sparkle *= smoothstep(0.45, 0.05, length(f));
      foil += vec3(sparkle * 4.0);
    }
    color = mix(color, foil, holo);
  }

  // 烫金：金属，拉丝噪声
  float gold = mask.g * uHolo;
  if (gold > 0.001) {
    float brushed = vnoise(vec2(mm.x * 0.4, mm.y * 40.0));
    vec3 Ng = normalize(vNormalW + B * (brushed - 0.5) * 0.12);
    vec3 Rg = reflect(-V, Ng);
    vec3 goldF0 = vec3(1.0, 0.77, 0.34);
    vec3 g = studioEnv(Rg, 0.28) * fresnel(goldF0, clamp(dot(Ng, V), 0.0, 1.0)) * 0.9 + goldF0 * 0.12;
    color = mix(color, g, gold);
  }

  // 圆角边缘的轻微抗锯齿
  float edgeAlpha = smoothstep(0.0, -0.15, sd);
  gl_FragColor = vec4(color, edgeAlpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
