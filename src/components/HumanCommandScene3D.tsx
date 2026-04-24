import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, Float } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";

/**
 * HumanCommandScene3D
 * A futuristic 3D scene showing a human figure at the center
 * with AI agent orbs orbiting around — visually telling the story:
 * "You command. They execute."
 */

function HumanFigure() {
  const groupRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
    if (auraRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
      auraRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      {/* Glowing aura behind figure */}
      <mesh ref={auraRef} position={[0, 0.2, -0.3]}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.06} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial
          color="#1a1a2a"
          metalness={0.85}
          roughness={0.2}
          emissive="#c9a84c"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Torso (tapered cylinder) */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.4, 0.55, 1.4, 32]} />
        <meshStandardMaterial
          color="#0e0e18"
          metalness={0.7}
          roughness={0.3}
          emissive="#c9a84c"
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Shoulders glow line */}
      <mesh position={[0, 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.5, 0.02, 16, 32]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.7} />
      </mesh>

      {/* Crown ring above head */}
      <mesh position={[0, 1.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.015, 16, 64]} />
        <meshBasicMaterial color="#c9a84c" />
      </mesh>

      {/* Floor circle */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.85, 64]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.0, 64]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function OrbitingAgent({
  radius,
  speed,
  offset,
  yLevel,
  color,
  size,
}: {
  radius: number;
  speed: number;
  offset: number;
  yLevel: number;
  color: string;
  size: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);

  const trailPositions = useMemo(() => new Float32Array(40 * 3), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed + offset;
    const x = Math.cos(t) * radius;
    const z = Math.sin(t) * radius;
    const y = yLevel + Math.sin(t * 2) * 0.15;

    if (ref.current) {
      ref.current.position.set(x, y, z);
    }

    if (trailRef.current) {
      const positions = trailRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = positions.length - 3; i >= 3; i -= 3) {
        positions[i] = positions[i - 3];
        positions[i + 1] = positions[i - 2];
        positions[i + 2] = positions[i - 1];
      }
      positions[0] = x;
      positions[1] = y;
      positions[2] = z;
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={40}
            array={trailPositions}
            itemSize={3}
            args={[trailPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={0.05} color={color} transparent opacity={0.4} sizeAttenuation />
      </points>
    </>
  );
}

function CommandBeam({ targetIndex, total }: { targetIndex: number; total: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      const angle = (targetIndex / total) * Math.PI * 2 + state.clock.elapsedTime * 0.3;
      ref.current.rotation.y = angle;
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.2 + Math.sin(state.clock.elapsedTime * 2 + targetIndex) * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={[0, 0.4, 0]}>
      <coneGeometry args={[0.05, 3, 8]} />
      <meshBasicMaterial color="#c9a84c" transparent opacity={0.25} />
    </mesh>
  );
}

function Scene() {
  const agents = useMemo(
    () => [
      { radius: 2.2, speed: 0.4, offset: 0, yLevel: 0.5, color: "#c9a84c", size: 0.1 },
      { radius: 2.5, speed: -0.3, offset: 1.2, yLevel: 1.2, color: "#06b6d4", size: 0.09 },
      { radius: 2.0, speed: 0.5, offset: 2.4, yLevel: -0.2, color: "#8b5cf6", size: 0.11 },
      { radius: 2.7, speed: -0.35, offset: 3.6, yLevel: 0.8, color: "#22c55e", size: 0.08 },
      { radius: 2.3, speed: 0.45, offset: 4.8, yLevel: 0.0, color: "#e8c96a", size: 0.1 },
      { radius: 2.6, speed: -0.4, offset: 6.0, yLevel: 1.4, color: "#c9a84c", size: 0.09 },
      { radius: 2.1, speed: 0.55, offset: 0.6, yLevel: -0.4, color: "#06b6d4", size: 0.08 },
      { radius: 2.4, speed: -0.45, offset: 1.8, yLevel: 1.0, color: "#8b5cf6", size: 0.1 },
    ],
    []
  );

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 2, 2]} intensity={1.5} color="#c9a84c" />
      <pointLight position={[-3, -2, -2]} intensity={0.5} color="#06b6d4" />
      <pointLight position={[3, -2, -2]} intensity={0.5} color="#8b5cf6" />

      <Stars radius={50} depth={50} count={1500} factor={3} fade speed={0.5} />

      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.3}>
        <HumanFigure />
      </Float>

      {agents.map((a, i) => (
        <OrbitingAgent key={i} {...a} />
      ))}

      {[0, 1, 2, 3].map((i) => (
        <CommandBeam key={i} targetIndex={i} total={4} />
      ))}

      {/* Outer ring */}
      <mesh rotation={[Math.PI / 2.2, 0, 0]} position={[0, 0.3, 0]}>
        <torusGeometry args={[3.2, 0.008, 8, 128]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 1.8, 0, 0]} position={[0, 0.3, 0]}>
        <torusGeometry args={[3.5, 0.005, 8, 128]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.15} />
      </mesh>
    </>
  );
}

export default function HumanCommandScene3D() {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 6], fov: 50 }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <Scene />
    </Canvas>
  );
}
