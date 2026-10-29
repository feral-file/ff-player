import {
  UpdateCursorPositionsReply,
  UpdateCursorPositionsRequest,
} from '@/models';
import {
  CursorPosition,
  CursorPositionListener,
} from '../custom-hooks/useCursorPositions';

/** Owns the cursor snapshot and synchronous listener delivery. */
export class CursorService {
  // Cursor positions
  private cursorPositionsListeners: CursorPositionListener[] = [];

  private currentCursorPositions: CursorPosition[] = [];

  public addCursorPositionsListener(callback: CursorPositionListener) {
    this.cursorPositionsListeners.push(callback);
    if (this.currentCursorPositions.length > 0) {
      callback(this.currentCursorPositions);
    }
  }

  public removeCursorPositionsListener(callback: CursorPositionListener) {
    this.cursorPositionsListeners = this.cursorPositionsListeners.filter(
      listener => listener !== callback
    );
  }

  public notifyCursorPositionsChanged(positions: CursorPosition[]) {
    this.currentCursorPositions = positions;
    this.cursorPositionsListeners.forEach(listener => {
      try {
        listener(positions);
      } catch (error) {
        console.error(
          '[CanvasService] Error in cursor positions listener:',
          error
        );
      }
    });
  }

  // ---------------------------- Interactions ----------------------------
  public updateCursorPositions(
    request: UpdateCursorPositionsRequest
  ): UpdateCursorPositionsReply {
    console.log('[CanvasService] updateCursorPositions: ', request);

    if (request.positions.length > 0) {
      this.notifyCursorPositionsChanged(request.positions);
    }

    return { ok: true };
  }
}
