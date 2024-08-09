import 'dart:async';

import 'package:feralfile_display_tizen/app_router.dart';
import 'package:feralfile_display_tizen/service/navigation_service.dart';
import 'package:feralfile_display_tizen/service/remote_config_service.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:flutter/material.dart';

class UpdateManager {
  final RemoteConfigService _remoteConfigService;
  final NavigationService _navigationService;
  Timer? _timer;

  UpdateManager(this._remoteConfigService, this._navigationService);

  Future<void> _checkForUpdates() async {
    final String currentHash = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.gitHash, '');
    // check for updates
    log.info('UpdateManager current hash: $currentHash');
    final String currentIntervalDuration = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.updateInterval, '');
    log.info(
        'UpdateManager current interval duration: $currentIntervalDuration');
    await _remoteConfigService.loadConfigs();

    final String newHash = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.gitHash, '');
    log.info('UpdateManager new hash: $newHash');
    final String newIntervalDuration = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.updateInterval, '');
    log.info('UpdateManager new interval duration: $newIntervalDuration');

    if (newIntervalDuration != currentIntervalDuration) {
      cancelTimer();
      start(duration: int.parse(newIntervalDuration));
    }

    if (currentHash != newHash) {
      log.info('UpdateManager: _checkForUpdates: new version detected');
      if (_navigationService.context == null) {
        return;
      }
      ScaffoldMessenger.of(_navigationService.context!).showSnackBar(
        const SnackBar(
          content: Text('Updating new version... Please wait'),
          duration: Duration(seconds: 5),
        ),
      );
      _navigationService.pushNamedOrReplace(AppRouter.inAppWebViewScreen,
          arguments: true);
    }
  }

  void start({int? duration}) {
    late int interval;
    if (duration != null) {
      interval = duration;
    } else {
      final String intervalSetting = _remoteConfigService.getConfig(
          ConfigGroup.tizen, ConfigKey.updateInterval, '');
      interval = int.parse(intervalSetting);
    }

    if (_timer?.isActive ?? false) {
      _timer!.cancel();
    }

    _timer = Timer.periodic(Duration(minutes: interval), (timer) async {
      await _checkForUpdates();
    });
  }

  void cancelTimer() {
    if (_timer?.isActive ?? false) {
      _timer!.cancel();
    }
  }
}
