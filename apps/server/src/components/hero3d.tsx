"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial } from "@react-three/drei";
import type { Mesh } from "three";

function Blob() {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.1;
    ref.current.rotation.y += delta * 0.14;
  });
  return (
    <Float speed={1.3} rotationIntensity={0.6} floatIntensity={1.1}>
      <Icosahedron ref={ref} args={[1.45, 8]}>
        <MeshDistortMaterial
          color="#6d5efc"
          emissive="#3a1d8a"
          emissiveIntensity={0.35}
          roughness={0.22}
          metalness={0.55}
          distort={0.42}
          speed={1.6}
        />
      </Icosahedron>
    </Float>
  );
}

/**
 * Soft WebGL accent for the hero — a slowly distorting, floating orb in the
 * brand palette. Rendered client-only (dynamic, ssr:false) and only when the
 * user hasn't requested reduced motion. Purely decorative, pointer-events:none.
 */
export function Hero3D() {
  return (
    <Canvas
      className="!absolute inset-0"
      camera={{ position: [0, 0, 4.2], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 3, 4]} intensity={1.7} color="#c4b5fd" />
      <pointLight position={[-4, -2, -2]} intensity={2.2} color="#ec4899" />
      <Blob />
    </Canvas>
  );
}
