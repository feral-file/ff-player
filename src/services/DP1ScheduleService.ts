import { DP1Call } from '@/models/dp1.model';
import { canvasService } from './CanvasService';
import { LocalStorageItem } from '@/constants';

export interface ScheduledDP1Task {
  id: string;
  scheduleTime: string;
  dp1CallData: DP1Call;
}

class DP1ScheduleService {
  private static _instance: DP1ScheduleService | undefined;
  private timeoutId: NodeJS.Timeout | null = null;

  public static getInstance(): DP1ScheduleService {
    if (!DP1ScheduleService._instance) {
      DP1ScheduleService._instance = new DP1ScheduleService();
    }
    return DP1ScheduleService._instance;
  }

  public storeScheduledTask(dp1CallData: DP1Call, scheduleTime: string): void {
    try {
      const newTask: ScheduledDP1Task = {
        id: dp1CallData.id,
        scheduleTime,
        dp1CallData,
      };

      localStorage.setItem(
        LocalStorageItem.dp1ScheduledTask,
        JSON.stringify(newTask)
      );

      console.log('[DP1ScheduleService] Stored scheduled task:', newTask);
      this.scheduleTask(newTask);
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error storing scheduled task:',
        error
      );
    }
  }

  public removeTask(taskId: string): void {
    try {
      const scheduledTask = this.getScheduledTask();
      if (scheduledTask && scheduledTask.id === taskId) {
        localStorage.removeItem(LocalStorageItem.dp1ScheduledTask);
        console.log('[DP1ScheduleService] Removed task:', taskId);
      }
    } catch (error) {
      console.error('[DP1ScheduleService] Error removing task:', error);
    }
  }

  public getScheduledTask(): ScheduledDP1Task | null {
    try {
      const stored = localStorage.getItem(LocalStorageItem.dp1ScheduledTask);
      return stored ? (JSON.parse(stored) as ScheduledDP1Task) : null;
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error getting scheduled tasks:',
        error
      );
      return null;
    }
  }

  public checkScheduledTask(): void {
    try {
      const scheduledTask = this.getScheduledTask();
      if (!scheduledTask) {
        console.log('[DP1ScheduleService] No existing scheduled tasks found');
        return;
      }

      if (this.isTaskDueNow(scheduledTask)) {
        this.executeScheduledTask(scheduledTask);
      } else {
        this.scheduleTask(scheduledTask);
      }
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error checking scheduled tasks:',
        error
      );
    }
  }

  private scheduleTask(task: ScheduledDP1Task): void {
    try {
      this.clearTimeoutIfExists();

      const now = new Date();
      const scheduleTime = new Date(task.scheduleTime);
      const timeDiff = scheduleTime.getTime() - now.getTime();

      console.log(
        `[DP1ScheduleService] Next task scheduled for: ${scheduleTime.toISOString()}`
      );
      console.log(
        `[DP1ScheduleService] Time until execution: ${Math.round(timeDiff / 1000).toString()} seconds`
      );

      if (this.isTaskDueNow(task)) {
        this.executeScheduledTask(task);
      } else {
        // Schedule check at exact time with a small buffer (1 second)
        const executionTime = timeDiff - 1000;
        this.timeoutId = setTimeout(() => {
          this.executeScheduledTask(task);
        }, executionTime);

        window.dispatchEvent(
          new CustomEvent('dp1ScheduleTimeoutSet', {
            detail: { scheduleTime: task.scheduleTime },
          })
        );
      }
    } catch (error) {
      console.error('[DP1ScheduleService] Error in scheduling logic:', error);
    }
  }

  private isTaskDueNow(task: ScheduledDP1Task): boolean {
    return new Date(task.scheduleTime) <= new Date();
  }

  private executeScheduledTask(scheduledTask: ScheduledDP1Task): void {
    console.log(
      '[DP1ScheduleService] Executing scheduled task:',
      scheduledTask.id
    );
    canvasService.executeScheduledDP1Task(scheduledTask.dp1CallData);
    this.removeTask(scheduledTask.id);
    this.clearTimeoutIfExists();
  }

  private clearTimeoutIfExists(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;

      window.dispatchEvent(new CustomEvent('dp1ScheduleTimeoutCleared'));
    }
  }
}

export const dp1ScheduleService = DP1ScheduleService.getInstance();
