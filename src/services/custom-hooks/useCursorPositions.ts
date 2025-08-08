import { useEffect, useState } from 'react';
import CanvasService from '../CanvasService';

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

    CanvasService.addCursorPositionsListener(handleCursorPositions);

    return () => {
      CanvasService.removeCursorPositionsListener(handleCursorPositions);
    };
  }, []);

  return { cursorPositions };
};

export default useCursorPositions;
