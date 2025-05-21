import { useEffect, useRef, useState } from 'react';
import CanvasService from '../CanvasService';

export interface CursorPosition {
  x: number;
  y: number;
}

export type CursorPositionListener = (positions: CursorPosition[]) => void;

const useCursorPositions = () => {
  const [cursorPositions, setCursorPositions] = useState<CursorPosition[]>([]);
  const canvasService = useRef(CanvasService.getInstance());

  useEffect(() => {
    const handleCursorPositions = (positions: CursorPosition[]) => {
      setCursorPositions(positions);
    };

    canvasService.current.addCursorPositionsListener(handleCursorPositions);

    return () => {
      canvasService.current.removeCursorPositionsListener(
        handleCursorPositions
      );
    };
  }, []);

  return { cursorPositions };
};

export default useCursorPositions;
