// ============================================================
// SweetReturns — First-Person (POV) Camera Controller
// WASD movement at ground level, mouse look via pointer lock.
// ============================================================

import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const MOVE_SPEED = 130;
const SPRINT_MULTIPLIER = 2.5;
const EYE_HEIGHT = 2.0;
const MOUSE_SENSITIVITY = 0.002;

export function FirstPersonControls() {
  const { camera, gl } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  const isLockedRef = useRef(false);
  const eulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Track pointer lock state
  useEffect(() => {
    const dom = gl.domElement;

    const onLockChange = () => {
      isLockedRef.current = document.pointerLockElement === dom;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLockedRef.current) return;
      const euler = eulerRef.current;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= e.movementX * MOUSE_SENSITIVITY;
      euler.x -= e.movementY * MOUSE_SENSITIVITY;
      euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    const onClick = () => {
      if (!isLockedRef.current) {
        dom.requestPointerLock();
      }
    };

    dom.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      dom.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (isLockedRef.current) document.exitPointerLock();
    };
  }, [camera, gl]);

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keysRef.current.add(e.code); };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.code); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const direction = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!isLockedRef.current) return;

    const keys = keysRef.current;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = MOVE_SPEED * (sprint ? SPRINT_MULTIPLIER : 1) * delta;

    // Get forward/right vectors from camera (flatten to XZ plane)
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();

    right.current.crossVectors(forward.current, camera.up).normalize();

    direction.current.set(0, 0, 0);

    if (keys.has('KeyW')) direction.current.add(forward.current);
    if (keys.has('KeyS')) direction.current.sub(forward.current);
    if (keys.has('KeyD')) direction.current.add(right.current);
    if (keys.has('KeyA')) direction.current.sub(right.current);

    if (direction.current.lengthSq() > 0) {
      direction.current.normalize().multiplyScalar(speed);
      camera.position.add(direction.current);
    }

    // Lock Y to eye height
    camera.position.y = EYE_HEIGHT;
  });

  return null;
}
