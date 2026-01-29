import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useEffect } from 'react'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// Create circular particle texture
function createCircleTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // Draw circle with soft edges
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)')
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

// Mouse tracking component
function MouseTracker({ mouse }) {
  const { viewport } = useThree()

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1
      mouse.current.worldX = (mouse.current.x * viewport.width) / 2
      mouse.current.worldY = (mouse.current.y * viewport.height) / 2
    }

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        mouse.current.x = (touch.clientX / window.innerWidth) * 2 - 1
        mouse.current.y = -(touch.clientY / window.innerHeight) * 2 + 1
        mouse.current.worldX = (mouse.current.x * viewport.width) / 2
        mouse.current.worldY = (mouse.current.y * viewport.height) / 2
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [viewport, mouse])

  return null
}

// Simple floating particles with circular shape
function FloatingParticles({
  count = 80,
  color = '#3b82f6',
  size = 0.12,
  spread = { x: 20, y: 14, z: 8 },
  mouse,
  sensitivity = 1,
  reducedMotion
}) {
  const meshRef = useRef()
  const positionsRef = useRef()
  const particleData = useRef([])
  const circleTexture = useMemo(() => createCircleTexture(), [])

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const data = []

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * spread.x
      const y = (Math.random() - 0.5) * spread.y
      const z = (Math.random() - 0.5) * spread.z - 2

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      data.push({
        originalX: x,
        originalY: y,
        originalZ: z,
        velocityX: 0,
        velocityY: 0,
        floatSpeed: 0.3 + Math.random() * 0.4,
        floatOffset: Math.random() * Math.PI * 2
      })
    }

    particleData.current = data
    return positions
  }, [count, spread])

  useFrame((state) => {
    if (!meshRef.current || !positionsRef.current) return

    const positions = positionsRef.current.array
    const data = particleData.current
    const time = state.clock.elapsedTime

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const p = data[i]

      // Gentle floating animation
      const floatY = Math.sin(time * p.floatSpeed + p.floatOffset) * 0.3
      const floatX = Math.cos(time * p.floatSpeed * 0.5 + p.floatOffset) * 0.2

      let targetX = p.originalX + floatX
      let targetY = p.originalY + floatY

      // Mouse repulsion
      if (!reducedMotion?.current && mouse?.current) {
        const dx = positions[i3] - (mouse.current.worldX || 0)
        const dy = positions[i3 + 1] - (mouse.current.worldY || 0)
        const dist = Math.sqrt(dx * dx + dy * dy)

        const influenceRadius = 3
        if (dist < influenceRadius && dist > 0.1) {
          const force = ((influenceRadius - dist) / influenceRadius) * 0.15 * sensitivity
          p.velocityX += (dx / dist) * force
          p.velocityY += (dy / dist) * force
        }
      }

      // Apply velocity
      targetX += p.velocityX
      targetY += p.velocityY

      // Smooth movement
      positions[i3] = THREE.MathUtils.lerp(positions[i3], targetX, 0.08)
      positions[i3 + 1] = THREE.MathUtils.lerp(positions[i3 + 1], targetY, 0.08)

      // Damping
      p.velocityX *= 0.95
      p.velocityY *= 0.95
    }

    positionsRef.current.needsUpdate = true
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          ref={positionsRef}
          attach="attributes-position"
          count={count}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        map={circleTexture}
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// Floating spheres (reduced count)
function FloatingSpheres({ count = 5, mouse, reducedMotion }) {
  const spheres = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 4 - 3
      ],
      scale: 0.3 + Math.random() * 0.5,
      speed: 0.2 + Math.random() * 0.2,
      offset: Math.random() * Math.PI * 2
    }))
  }, [count])

  return (
    <group>
      {spheres.map((sphere, i) => (
        <AnimatedSphere
          key={i}
          {...sphere}
          index={i}
          mouse={mouse}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

function AnimatedSphere({ position, scale, speed, offset, index, mouse, reducedMotion }) {
  const meshRef = useRef()
  const initialPos = useMemo(() => [...position], [position])

  useFrame((state) => {
    if (!meshRef.current) return

    const time = state.clock.elapsedTime

    // Gentle floating
    meshRef.current.position.y = initialPos[1] + Math.sin(time * speed + offset) * 0.5
    meshRef.current.position.x = initialPos[0] + Math.cos(time * speed * 0.5 + offset) * 0.3

    // Mouse influence
    if (!reducedMotion?.current && mouse?.current) {
      meshRef.current.position.x += (mouse.current.worldX || 0) * 0.05
      meshRef.current.position.y += (mouse.current.worldY || 0) * 0.05
    }
  })

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        color="#3b82f6"
        transparent
        opacity={0.1}
        roughness={0.5}
        metalness={0.3}
      />
    </mesh>
  )
}

// Main scene - simplified
function Scene({ reducedMotion }) {
  const mouse = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 })

  return (
    <>
      <MouseTracker mouse={mouse} />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.6} color="#3b82f6" />
      <pointLight position={[-10, -10, 5]} intensity={0.3} color="#8b5cf6" />

      {/* Main particle layer - sparse */}
      <FloatingParticles
        count={100}
        color="#3b82f6"
        size={0.1}
        spread={{ x: 24, y: 16, z: 10 }}
        mouse={mouse}
        sensitivity={1}
        reducedMotion={reducedMotion}
      />

      {/* Secondary layer - smaller, dimmer */}
      <FloatingParticles
        count={50}
        color="#8b5cf6"
        size={0.06}
        spread={{ x: 20, y: 14, z: 6 }}
        mouse={mouse}
        sensitivity={0.5}
        reducedMotion={reducedMotion}
      />

      {/* Floating spheres - reduced */}
      <FloatingSpheres count={5} mouse={mouse} reducedMotion={reducedMotion} />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.3}
          luminanceSmoothing={0.9}
          intensity={0.8}
          radius={0.6}
        />
      </EffectComposer>
    </>
  )
}

export default function ParticleBackground() {
  const reducedMotion = useRef(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mediaQuery.matches

    const handleChange = (e) => {
      reducedMotion.current = e.matches
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return (
    <div className="absolute inset-0" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Scene reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
