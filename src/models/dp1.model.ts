export interface DP1 {
  intent: DP1Intent;
  dp1_call: DP1Call;
}

export interface DP1Intent {
  action: DP1Action;
  schedule_time?: string;
}

export interface DP1Call {
  dpVersion: string;
  id: string;
  created: string;
  defaults: DP1Defaults;
  items: DP1Item[];
  signature: string;
}

export enum DP1Action {
  NowDisplay = 'now_display',
  SchedulePlay = 'schedule_play',
  GetCurrentPlaylist = 'get_current_playlist',
}

export interface DP1Defaults {
  display: DP1Display;
}

export interface DP1Display {
  scaling: string;
  background: string;
  margin: string;
}

export interface DP1Item {
  id: string;
  title: string;
  source: string;
  duration: number;
  license: DP1License;
}

export enum DP1License {
  Open = 'open',
  Token = 'token',
  Subscription = 'subscription',
}
