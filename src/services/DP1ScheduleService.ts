import { DP1Call } from '@/models/dp1.model';
import { canvasService } from './CanvasService';
import { LocalStorageItem } from '@/constants';
import DeviceManager from '@/utils/DeviceManager';

export interface ScheduledDP1Task {
  id: string;
  scheduleTime: string;
  dp1CallData: DP1Call;
}

class DP1ScheduleService {
  private static instance: DP1ScheduleService | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  public static getInstance(): DP1ScheduleService {
    DP1ScheduleService.instance ??= new DP1ScheduleService();
    return DP1ScheduleService.instance;
  }

  public async storeScheduledTask(
    dp1CallData: DP1Call,
    scheduleTime: string
  ): Promise<void> {
    try {
      const newTask: ScheduledDP1Task = {
        id: dp1CallData.id ?? '',
        scheduleTime,
        dp1CallData,
      };

      await DeviceManager.setItem(
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

  public async removeTask(taskId: string): Promise<void> {
    try {
      const scheduledTask = await this.getScheduledTask();
      if (scheduledTask?.id === taskId) {
        await DeviceManager.removeItem(LocalStorageItem.dp1ScheduledTask);
        console.log('[DP1ScheduleService] Removed task:', taskId);
      }
    } catch (error) {
      console.error('[DP1ScheduleService] Error removing task:', error);
    }
  }

  public async getScheduledTask(): Promise<ScheduledDP1Task | null> {
    try {
      const stored = await DeviceManager.getItem(
        LocalStorageItem.dp1ScheduledTask
      );
      return stored ? (JSON.parse(stored) as ScheduledDP1Task) : null;
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error getting scheduled tasks:',
        error
      );
      return null;
    }
  }

  public async checkScheduledTask(): Promise<void> {
    try {
      const scheduledTask = await this.getScheduledTask();
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
    this.removeTask(scheduledTask.id).catch((error: unknown) => {
      console.error(
        '[DP1ScheduleService] Error removing task after execution:',
        error
      );
    });
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

export default DP1ScheduleService.getInstance();
