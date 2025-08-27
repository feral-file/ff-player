import { useEffect, useState } from 'react';
import { canvasService } from '../CanvasService';

export interface CursorPosition {
  x: number;
  y: number;
}

export type CursorPositionListener = (positions: CursorPosition[]) => void;

const useCursorPositions = () => {
  const [cursorPositions, setCursorPositions] = useState<CursorPosition[]>([]);

  useEffect(() => {
    const handleCursorPositions = (positions: CursorPosition[]) => {
      setCursorPositions(positions);
    };

    canvasService.addCursorPositionsListener(handleCursorPositions);

    return () => {
      canvasService.removeCursorPositionsListener(handleCursorPositions);
    };
  }, []);

  return { cursorPositions };
};

export default useCursorPositions;
