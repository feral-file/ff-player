'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { CursorPosition } from '@/services/custom-hooks/useCursorPositions';

export interface CursorLayerHandle {
  setPositions: (p: CursorPosition[]) => void;
}

const CURSOR_SIZE = 18;
const HIDE_DELAY = 5000; // ms
const SPEED_FACTOR = 10; // tune responsiveness
const MIN_SPEED = 2500; // px / s   (too slow feels lag)
const MAX_SPEED = 4000; // px / s   (cap for long jumps)

const CursorLayer = forwardRef<CursorLayerHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const positionsRef = useRef<CursorPosition[]>([]);
  const currentPos = useRef<CursorPosition | null>(null);
  const targetIdx = useRef(0);
  const animId = useRef<number | null>(null);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const [visible, setVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  const resetHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
    setIsAnimating(false);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_DELAY);
  };

  const updateContainerSize = () => {
    const box = containerRef.current;
    if (!box) return;
    setW(box.clientWidth);
    setH(box.clientHeight);
  };

  const stopAnim = () => {
    if (animId.current) cancelAnimationFrame(animId.current);
    animId.current = null;
    setIsAnimating(false);
  };

  const startAnim = () => {
    const box = containerRef.current;
    const cursor = cursorRef.current;
    if (!box || !cursor) return;
    setIsAnimating(true);

    let prev = performance.now();

    const step = (now: number) => {
      const dt = (now - prev) / 1000; // seconds
      prev = now;

      if (!currentPos.current) {
        animId.current = requestAnimationFrame(step);
        return;
      }
      if (targetIdx.current >= positionsRef.current.length) {
        resetHide();
        return;
      }

      const { x: cx, y: cy } = currentPos.current;
      const { x: txRaw, y: tyRaw } = positionsRef.current[targetIdx.current];
      // clamp
      const tx = Math.max(0, Math.min(txRaw, w));
      const ty = Math.max(0, Math.min(tyRaw, h));

      const dx = tx - cx;
      const dy = ty - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < 1) {
        currentPos.current = { x: tx, y: ty };
        targetIdx.current += 1;
      } else {
        /* ---------- dynamic speed ---------- */
        const rawSpeed = dist * SPEED_FACTOR; // proportional to gap
        const dynamicSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, rawSpeed));

        const move = Math.min(dist, dynamicSpeed * dt);
        const nx = cx + (dx / dist) * move;
        const ny = cy + (dy / dist) * move;
        currentPos.current = { x: nx, y: ny };
      }
      const { x, y } = currentPos.current;
      cursor.style.transform = `translate3d(${(x - CURSOR_SIZE / 2).toString()}px,${(
        y -
        CURSOR_SIZE / 2
      ).toString()}px,0)`;

      animId.current = requestAnimationFrame(step);
    };

    animId.current = requestAnimationFrame(step);
  };

  const initCursorFirstPosition = () => {
    const box = containerRef.current;
    const cursor = cursorRef.current;
    if (!box || !cursor) return;

    const cx = box.clientWidth / 2;
    const cy = box.clientHeight / 2;
    currentPos.current = { x: cx, y: cy };
    cursor.style.transform = `translate3d(${(cx - CURSOR_SIZE / 2).toString()}px,${(
      cy -
      CURSOR_SIZE / 2
    ).toString()}px,0)`;
  };

  // Expose handle
  useImperativeHandle(ref, () => ({
    setPositions: (arr: CursorPosition[]) => {
      const box = containerRef.current;
      const cursor = cursorRef.current;
      if (!box || !cursor) return;

      stopAnim();
      positionsRef.current = arr;
      targetIdx.current = 0;

      // Start from current position instead of center
      if (!currentPos.current) {
        initCursorFirstPosition();
      }

      updateContainerSize();
      resetHide();
      startAnim();
      setIsAnimating(true);
    },
  }));

  // Cleanup
  useEffect(
    () => () => {
      stopAnim();
    },
    []
  );

  useEffect(() => {
    setVisible(false);
    updateContainerSize();
    initCursorFirstPosition();
  }, [containerRef.current]);

  // Render
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}>
      <div
        ref={cursorRef}
        style={{
          position: 'absolute',
          width: `${(Math.min(window.innerWidth, window.innerHeight) * 0.012).toString()}px`,
          height: `${(Math.min(window.innerWidth, window.innerHeight) * 0.012).toString()}px`,
          background: '#ff0',
          borderRadius: '50%',
          boxShadow: '0 2px 8px #0007',
          opacity: visible || isAnimating ? 1 : 0,
          transition: 'opacity 0.3s ease',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

// Fix the displayName to avoid linter error
CursorLayer.displayName = 'CursorLayer';
export default CursorLayer;
