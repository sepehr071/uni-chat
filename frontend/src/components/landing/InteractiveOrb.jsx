import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

export default function InteractiveOrb({ mouse, reducedMotion, position = [3, 0, 0] }) {
  const meshRef = useRef()
  const targetPosition = useRef(new THREE.Vector3(...position))

  // Smoothing factor for orb movement
  const smoothing = 0.05

  useFrame((state) => {
    if (!meshRef.current) return

    if (reducedMotion?.current) {
      // Simple rotation only for reduced motion
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2
      return
    }

    // Calculate target position based on mouse
    const mouseX = mouse?.current?.x || 0
    const mouseY = mouse?.current?.y || 0

    targetPosition.current.x = position[0] + mouseX * 1.5
    targetPosition.current.y = position[1] + mouseY * 1.2

    // Lerp to target position
    meshRef.current.position.x = THREE.MathUtils.lerp(
      meshRef.current.position.x,
      targetPosition.current.x,
      smoothing
    )
    meshRef.current.position.y = THREE.MathUtils.lerp(
      meshRef.current.position.y,
      targetPosition.current.y,
      smoothing
    )

    // Subtle rotation
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.15
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.2
  })

  return (
    <mesh ref={meshRef} position={position} scale={1.2}>
      <icosahedronGeometry args={[1, 4]} />
      <MeshDistortMaterial
        color="#3b82f6"
        emissive="#8b5cf6"
        emissiveIntensity={0.4}
        roughness={0.2}
        metalness={0.8}
        distort={0.3}
        speed={2}
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}
