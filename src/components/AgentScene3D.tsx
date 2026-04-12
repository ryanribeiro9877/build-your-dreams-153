import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";

function AgentOrb({ position, color, speed, radius }: { position: [number, number, number]; color: string; speed: number; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);
  const angle = useRef(Math.random() * Math.PI * 2);

  const trailPositions = useMemo(() => new Float32Array(90), []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    angle.current += delta * speed;
    ref.current.position.x = position[0] + Math.cos(angle.current) * radius;
    ref.current.position.z = position[2] + Math.sin(angle.current) * radius;
    ref.current.position.y = position[1] + Math.sin(angle.current * 2) * 0.3;

    // Update trail
    if (trailRef.current) {
      const geo = trailRef.current.geometry;
      const pos = geo.attributes.position.array as Float32Array;
      for (let i = pos.length - 3; i >= 3; i -= 3) {
        pos[i] = pos[i - 3];
        pos[i + 1] = pos[i - 2];
        pos[i + 2] = pos[i - 1];
      }
      pos[0] = ref.current.position.x;
      pos[1] = ref.current.position.y;
      pos[2] = ref.current.position.z;
      geo.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={ref} position={position}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={trailPositions} count={30} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.04} transparent opacity={0.4} sizeAttenuation />
      </points>
    </>
  );
}

function ConnectionBeam({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const opacity = useRef(0);
  const dir = useRef(1);

  useFrame((_, delta) => {
    opacity.current += dir.current * delta * 1.5;
    if (opacity.current > 1) { opacity.current = 1; dir.current = -1; }
    if (opacity.current < 0) { opacity.current = 0; dir.current = 1; }
    if (ref.current) {
      (ref.current.material as THREE.MeshBasicMaterial).opacity = opacity.current * 0.3;
    }
  });

  const mid: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.5, (from[2] + to[2]) / 2];
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(...from),
    new THREE.Vector3(...mid),
    new THREE.Vector3(...to),
  );
  const points = curve.getPoints(20);
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, 0.015, 4, false);

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={0.3} />
    </mesh>
  );
}

function CentralHub() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.3;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.35, 2]} />
        <meshStandardMaterial color="#c9a84c" emissive="#c9a84c" emissiveIntensity={1.5} wireframe toneMapped={false} />
      </mesh>
      <pointLight color="#c9a84c" intensity={3} distance={6} />
    </Float>
  );
}

function DataRing({ radius, color, speed }: { radius: number; color: string; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * speed;
    }
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.008, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.25} />
    </mesh>
  );
}

function Scene() {
  const agents = useMemo(() => [
    { pos: [0, 0.5, 1.2] as [number, number, number], color: "#8b5cf6", speed: 0.8, radius: 0.6 },
    { pos: [1.2, -0.3, 0] as [number, number, number], color: "#06b6d4", speed: 1.0, radius: 0.5 },
    { pos: [-1.0, 0.2, -0.5] as [number, number, number], color: "#14b8a6", speed: 0.6, radius: 0.7 },
    { pos: [0.5, -0.5, -1.2] as [number, number, number], color: "#f59e0b", speed: 0.9, radius: 0.4 },
    { pos: [-0.8, 0.6, 0.8] as [number, number, number], color: "#ef4444", speed: 1.1, radius: 0.55 },
    { pos: [0.3, 0.8, -0.6] as [number, number, number], color: "#6366f1", speed: 0.7, radius: 0.65 },
  ], []);

  const connections = useMemo(() => [
    { from: agents[0].pos, to: agents[1].pos, color: "#c9a84c" },
    { from: agents[1].pos, to: agents[2].pos, color: "#8b5cf6" },
    { from: agents[2].pos, to: agents[3].pos, color: "#06b6d4" },
    { from: agents[3].pos, to: agents[4].pos, color: "#14b8a6" },
    { from: agents[4].pos, to: agents[5].pos, color: "#f59e0b" },
    { from: agents[5].pos, to: agents[0].pos, color: "#6366f1" },
    { from: agents[0].pos, to: [0, 0, 0] as [number, number, number], color: "#c9a84c" },
    { from: agents[2].pos, to: [0, 0, 0] as [number, number, number], color: "#c9a84c" },
    { from: agents[4].pos, to: [0, 0, 0] as [number, number, number], color: "#c9a84c" },
  ], [agents]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <Stars radius={50} depth={50} count={2000} factor={3} saturation={0} fade speed={1} />
      <CentralHub />
      <DataRing radius={1.8} color="#c9a84c" speed={0.15} />
      <DataRing radius={2.4} color="#8b5cf6" speed={-0.1} />
      <DataRing radius={3.0} color="#06b6d4" speed={0.08} />

      {agents.map((a, i) => (
        <AgentOrb key={i} position={a.pos} color={a.color} speed={a.speed} radius={a.radius} />
      ))}
      {connections.map((c, i) => (
        <ConnectionBeam key={i} from={c.from} to={c.to} color={c.color} />
      ))}
    </>
  );
}

export default function AgentScene3D() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 1.5, 4.5], fov: 50 }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
