import {
  WebSocketMessage,
  CastCommand,
  Reply,
  ConnectRequestV2,
  ConnectReplyV2,
  DisconnectReplyV2,
  CheckDeviceStatusRequest,
  CheckDeviceStatusReply,
  CastExhibitionRequest,
  CastExhibitionReply,
  CastListArtworkRequest,
  CastListArtworkReply,
  NextArtworkRequest,
  NextArtworkReply,
  PauseCastingRequest,
  PauseCastingReply,
  ResumeCastingRequest,
  ResumeCastingReply,
  PreviousArtworkRequest,
  PreviousArtworkReply,
  MoveToArtworkRequest,
  MoveToArtworkReply,
  UpdateDurationRequest,
  UpdateDurationReply,
  RotateRequest,
  RotateReply,
  TapGestureRequest,
  GestureReply,
  DragGestureRequest,
  GetCursorOffsetRequest,
  GetCursorOffsetReply,
  SetCursorOffsetRequest,
  SetCursorOffsetReply,
  KeyboardEventRequest,
  KeyboardEventReply,
  CastInfo,
} from "./types";

import DeviceManager from "./DeviceManager";

class CanvasService {
  private castInfo: CastInfo | null = null;
  private clientDeviceInfo: any = null;
  private timer: any = null;

  constructor() {}

  public getCastInfo() {
    return this.castInfo;
  }

  public async processMessage(event: MessageEvent) {
    console.log("processMessage", event);

    const webSocketMessage: WebSocketMessage = JSON.parse(event.data);
    const messageData = JSON.parse(webSocketMessage.message);

    if (
      webSocketMessage.messageID.startsWith("system") ||
      webSocketMessage.messageID === "ping"
    ) {
      // Handle system messages or ping-pong messages
      return;
    }

    const commandStr = messageData.command;
    if (!commandStr) {
      console.error("Command not found in the message:", messageData);
      return;
    }

    const command = CastCommand[commandStr as keyof typeof CastCommand];
    if (!command) {
      console.error("Invalid command:", commandStr);
      return;
    }

    const requestJson = messageData.request;

    console.log(`Received command: ${commandStr}`);

    const reply = await this.commandHandler(command, requestJson);

    const responseMessage: WebSocketMessage = {
      messageID: webSocketMessage.messageID,
      message: reply,
    };

    return responseMessage;
  }

  private async commandHandler(
    command: CastCommand,
    requestJson: any
  ): Promise<Reply> {
    if (this.castInfo) {
      this.castInfo = {
        ...this.castInfo,
        castCommand: command,
      };
    } else {
      this.castInfo = {
        castCommand: command,
      };
    }
    console.log("------------");
    console.log("commandHandler", this.castInfo);
    console.log("------------");

    switch (command) {
      case CastCommand.connect:
        return this.connect(requestJson);
      case CastCommand.disconnect:
        return this.disconnect(requestJson);
      case CastCommand.checkStatus:
        return this.status(requestJson);
      case CastCommand.castListArtwork:
        return this.castListArtwork(requestJson);
      // case CastCommand.cancelCasting:
      //   return this.cancelCasting(requestJson);
      // case CastCommand.appendArtworkToCastingList:
      //   return this.appendListArtwork(requestJson);
      case CastCommand.pauseCasting:
        return this.pauseCasting(requestJson);
      case CastCommand.resumeCasting:
        return this.resumeCasting(requestJson);
      case CastCommand.nextArtwork:
        return this.nextArtwork(requestJson);
      case CastCommand.previousArtwork:
        return this.previousArtwork(requestJson);
      case CastCommand.moveToArtwork:
        return this.moveToArtwork(requestJson);
      case CastCommand.updateDuration:
        return this.updateDuration(requestJson);
      case CastCommand.castExhibition:
        return this.castExhibition(requestJson);
      case CastCommand.rotate:
        return this.rotate(requestJson);
      case CastCommand.tapGesture:
        return this.tapGesture(requestJson);
      case CastCommand.dragGesture:
        return this.dragGesture(requestJson);
      case CastCommand.setCursorOffset:
        return this.setCursorOffset(requestJson);
      case CastCommand.getCursorOffset:
        return this.getCursorOffset(requestJson);
      case CastCommand.sendKeyboardEvent:
        return this.keyboardEvent(requestJson);
      default:
        console.error(`Unknown command: ${command}`);
        return { ok: false };
    }
  }

  private async connect(request: ConnectRequestV2): Promise<ConnectReplyV2> {
    console.log("connect", request);

    const deviceInfo = DeviceManager.getDeviceInfo(); // Get the website’s device info

    if (!deviceInfo) {
      console.error("Device info is not available");
      return { ok: false };
    }

    this.clientDeviceInfo = request.clientDevice;
    this.castInfo = {
      artworks: [],
      deviceInfo: {
        device_id: this.clientDeviceInfo.device_id,
        device_name: this.clientDeviceInfo.device_name,
      },
      startTime: Date.now(),
    };
    console.log("_connected device:", this.clientDeviceInfo);
    return { ok: true };
  }

  private async disconnect(request: any): Promise<DisconnectReplyV2> {
    console.log("disconnect", request);
    this.onDisconnect();
    return { ok: true };
  }

  private async status(
    request: CheckDeviceStatusRequest
  ): Promise<CheckDeviceStatusReply> {
    console.log("checkStatus", request);
    return {
      ok: true,
      startTime: Date.now(),
      artworks: this.castInfo?.artworks ?? [],
      connectedDevice: this.castInfo?.deviceInfo,
      exhibitionId: this.castInfo?.exhibitionId,
    };
  }

  private async castExhibition(
    request: CastExhibitionRequest
  ): Promise<CastExhibitionReply> {
    console.log("castExhibition", request);
    // Implementation similar to the Dart code
    return { ok: true };
  }

  private async castListArtwork(
    request: CastListArtworkRequest
  ): Promise<CastListArtworkReply> {
    console.log("castListArtwork", request);
    this.castInfo = {
      ...this.castInfo,
      artworks: request.artworks,
      startTime: request.startTime ?? Date.now(),
    };
    return { ok: true };
  }

  private async nextArtwork(
    request: NextArtworkRequest
  ): Promise<NextArtworkReply> {
    console.log("nextArtwork", request);
    return { ok: true };
  }

  private async pauseCasting(
    request: PauseCastingRequest
  ): Promise<PauseCastingReply> {
    console.log("pauseCasting", request);
    return { ok: true };
  }

  private async resumeCasting(
    request: ResumeCastingRequest
  ): Promise<ResumeCastingReply> {
    console.log("resumeCasting", request);
    return { ok: true };
  }

  private async previousArtwork(
    request: PreviousArtworkRequest
  ): Promise<PreviousArtworkReply> {
    console.log("previousArtwork", request);
    return { ok: true };
  }

  private async moveToArtwork(
    request: MoveToArtworkRequest
  ): Promise<MoveToArtworkReply> {
    console.log("moveToArtwork", request);
    return { ok: true };
  }

  private async updateDuration(
    request: UpdateDurationRequest
  ): Promise<UpdateDurationReply> {
    console.log("updateDuration", request);
    this.castInfo = {
      ...this.castInfo,
      artworks: request.artworks,
    };

    return {
      ok: true,
      startTime: Date.now(),
      artworks: request.artworks,
    };
  }

  private async rotate(request: RotateRequest): Promise<RotateReply> {
    console.log("rotate", request);
    return { ok: true, degree: 0 };
  }

  private async tapGesture(request: TapGestureRequest): Promise<GestureReply> {
    console.log("tapGesture", request);
    return { ok: true };
  }

  private async dragGesture(
    request: DragGestureRequest
  ): Promise<GestureReply> {
    console.log("dragGesture", request);
    return { ok: true };
  }

  private async getCursorOffset(
    request: GetCursorOffsetRequest
  ): Promise<GetCursorOffsetReply> {
    console.log("getCursorOffset", request);
    return {
      ok: true,
      cursorOffset: { dx: 0, dy: 0, coefficientX: 1, coefficientY: 1 },
    };
  }

  private async setCursorOffset(
    request: SetCursorOffsetRequest
  ): Promise<SetCursorOffsetReply> {
    console.log("setCursorOffset", request);
    return { ok: true };
  }

  private async keyboardEvent(
    request: KeyboardEventRequest
  ): Promise<KeyboardEventReply> {
    console.log("keyboardEvent", request);
    this.castInfo = {
      ...this.castInfo,
      value: request.code,
    };
    return { ok: true };
  }

  private onDisconnect() {
    console.log("onDisconnect");
    this.castInfo = null;
  }

  private setTimer(state: any, onNext: Function | null) {
    console.log("setTimer", state);
    this.cancelTimer();
    if (state.artworks.length <= 1) {
      return;
    }
    const currentArtwork = state.currentArtwork;
    const castingIndex = state.castingIndex;
    const artworkStartTime = state.artworkLastStartTime(castingIndex);
    const remainingDuration =
      currentArtwork.duration - (Date.now() - artworkStartTime);
    if (remainingDuration <= 0) return;
    console.log("setTimer: remainingDuration", remainingDuration);
    this.timer = setTimeout(() => {
      if (onNext) onNext();
    }, remainingDuration - 1000);
  }

  private cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export default CanvasService;
