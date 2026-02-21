// ============================================================
// candyGlow — Candy glow shader material factory
// ============================================================

import { ShaderMaterial, Color } from 'three';

export function createCandyGlowMaterial(params: {
  goldenScore: number;
  tierColor: string;
  isPlatinum: boolean;
}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      u_goldenScore: { value: params.goldenScore / 5.0 },
      u_time: { value: 0.0 },
      u_tierColor: { value: new Color(params.tierColor) },
      u_isPlatinum: { value: params.isPlatinum ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float u_goldenScore;
      uniform float u_time;
      uniform vec3 u_tierColor;
      uniform float u_isPlatinum;
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vec3 baseColor = u_tierColor;
        float glow = u_goldenScore * 0.8;

        // Platinum: pulsing effect
        if (u_isPlatinum > 0.5) {
          glow += sin(u_time * 3.0) * 0.3 + 0.3;
          float stripe = step(0.5, fract(vUv.y * 10.0 + u_time * 0.5));
          baseColor = mix(baseColor, vec3(1.0, 0.84, 0.0), stripe * 0.3);
        }

        // Simple lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diff = max(dot(vNormal, lightDir), 0.3);

        vec3 emissive = baseColor * glow;
        vec3 finalColor = baseColor * diff + emissive;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    transparent: false,
  });
}
