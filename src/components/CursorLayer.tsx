'use client';

import { CursorPosition } from '@/services/custom-hooks/useCursorPositions';
import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';

function linearInterpolation(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export interface CursorLayerHandle {
  setPositions: (positions: CursorPosition[]) => void;
}

const CursorLayer = forwardRef<CursorLayerHandle>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const positionsRef = useRef<CursorPosition[]>([]);
  const currentPos = useRef<CursorPosition | null>(null);
  const targetIndex = useRef(0);

  const HIDE_DELAY = 5000; // 5 seconds

  const resetHideTimer = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setIsVisible(true);
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, HIDE_DELAY);
  };

  // For parent or external calls
  useImperativeHandle(ref, () => ({
    setPositions: (positions: CursorPosition[]) => {
      // Reset animation to center and use new positions
      stopAnimation();
      positionsRef.current = positions;
      targetIndex.current = 0;

      const div = containerRef.current;
      const cursor = cursorRef.current;
      if (!div || !cursor) return;

      // Move cursor to center
      const centerX = div.clientWidth / 2;
      const centerY = div.clientHeight / 2;
      currentPos.current = { x: centerX, y: centerY };
      cursor.style.left = `${(centerX - 9).toString()}px`;
      cursor.style.top = `${(centerY - 9).toString()}px`;

      resetHideTimer();
      startAnimation();
    },
  }));

  function stopAnimation() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  function startAnimation() {
    let waiting = false;
    function animate() {
      if (!currentPos.current) return;
      if (waiting) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      if (targetIndex.current >= positionsRef.current.length) {
        // Start hide timer when animation completes
        resetHideTimer();
        return;
      }

      const target = positionsRef.current[targetIndex.current];
      const div = containerRef.current;
      const cursor = cursorRef.current;
      if (!div || !cursor) return;
      const safeX = Math.max(0, Math.min(target.x, div.clientWidth));
      const safeY = Math.max(0, Math.min(target.y, div.clientHeight));
      let { x, y } = currentPos.current;
      const speed = 0.13;

      x = linearInterpolation(x, safeX, speed);
      y = linearInterpolation(y, safeY, speed);
      cursor.style.left = `${(x - 9).toString()}px`;
      cursor.style.top = `${(y - 9).toString()}px`;
      currentPos.current = { x, y };
      if (Math.abs(x - safeX) < 1 && Math.abs(y - safeY) < 1) {
        cursor.style.left = `${(safeX - 9).toString()}px`;
        cursor.style.top = `${(safeY - 9).toString()}px`;
        currentPos.current = { x: safeX, y: safeY };
        targetIndex.current += 1;
        waiting = true;
        setTimeout(() => {
          waiting = false;
          animRef.current = requestAnimationFrame(animate);
        }, 200); // pause before next move
        return;
      }
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
  }

  useEffect(() => {
    // Initial hide timer
    resetHideTimer();

    return () => {
      stopAnimation();
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        pointerEvents: 'none',
      }}>
      <div
        ref={cursorRef}
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          background: '#ff0',
          borderRadius: '50%',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px #0007',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.3s ease-in-out',
        }}
      />
    </div>
  );
});

// Fix the displayName to avoid linter error
CursorLayer.displayName = 'CursorLayer';

export default CursorLayer;
