import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'

function FloatingParticles({ count = 200 }) {
  const mesh = useRef()

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15
    }
    return positions
  }, [count])

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.elapsedTime * 0.03
      mesh.current.rotation.y = state.clock.elapsedTime * 0.05
    }
  })

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#3b82f6"
        transparent
        opacity={0.5}
        sizeAttenuation
      />
    </points>
  )
}

function AnimatedSphere({ position, scale, speed, index }) {
  const mesh = useRef()
  const initialPosition = useMemo(() => [...position], [position])

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.position.y = initialPosition[1] + Math.sin(state.clock.elapsedTime * speed + index) * 0.8
      mesh.current.position.x = initialPosition[0] + Math.cos(state.clock.elapsedTime * speed * 0.5 + index) * 0.5
    }
  })

  return (
    <mesh ref={mesh} position={position} scale={scale}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        color="#3b82f6"
        transparent
        opacity={0.15}
        roughness={0.8}
        metalness={0.2}
      />
    </mesh>
  )
}

function FloatingSpheres({ count = 12 }) {
  const spheres = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 8 - 2
      ],
      scale: 0.3 + Math.random() * 0.6,
      speed: 0.3 + Math.random() * 0.4
    }))
  }, [count])

  return spheres.map((sphere, i) => (
    <AnimatedSphere key={i} {...sphere} index={i} />
  ))
}

export default function ParticleBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.6} color="#3b82f6" />
        <pointLight position={[-10, -10, 5]} intensity={0.3} color="#8b5cf6" />
        <FloatingParticles count={250} />
        <FloatingSpheres count={10} />
      </Canvas>
    </div>
  )
}
