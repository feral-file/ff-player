import { DP1, DP1Call } from '@/models/dp1.model';
import CanvasService from './CanvasService';
import { LocalStorageItem } from '@/constants';

export interface ScheduledDP1Task {
  id: string;
  scheduleTime: string;
  dp1CallData: DP1Call;
}

class DP1ScheduleService {
  private static instance: DP1ScheduleService | null = null;

  public static getInstance(): DP1ScheduleService {
    if (!DP1ScheduleService.instance) {
      DP1ScheduleService.instance = new DP1ScheduleService();
    }
    return DP1ScheduleService.instance;
  }

  public storeScheduledTask(dp1Data: DP1): void {
    try {
      if (!dp1Data.intent.schedule_time) {
        return;
      }

      const newTask: ScheduledDP1Task = {
        id: dp1Data.dp1_call.id,
        scheduleTime: dp1Data.intent.schedule_time.replace('Z', ''),
        dp1CallData: dp1Data.dp1_call,
      };

      localStorage.setItem(
        LocalStorageItem.dp1ScheduledTask,
        JSON.stringify(newTask)
      );

      console.log(
        '[DP1ScheduleService] Stored scheduled task (overriding previous):',
        newTask
      );
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error storing scheduled task:',
        error
      );
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

  public getTasksDueNow(): ScheduledDP1Task | null {
    const now = new Date();
    const scheduledTask = this.getScheduledTask();

    if (!scheduledTask) {
      return null;
    }

    try {
      const scheduleTime = new Date(scheduledTask.scheduleTime);
      return scheduleTime <= now ? scheduledTask : null;
    } catch (error) {
      console.error('[DP1ScheduleService] Error parsing schedule time:', error);
      return null;
    }
  }

  public checkAndExecuteScheduledTasks(): void {
    try {
      const tasksDueNow = this.getTasksDueNow();
      if (tasksDueNow) {
        console.log(
          '[DP1ScheduleService] Executing scheduled task:',
          tasksDueNow.id
        );

        CanvasService.getInstance().executeScheduledDP1Task(
          tasksDueNow.dp1CallData.items
        );

        this.removeTask(tasksDueNow.id);
      }
    } catch (error) {
      console.error(
        '[DP1ScheduleService] Error checking scheduled tasks:',
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
}

export default DP1ScheduleService;
