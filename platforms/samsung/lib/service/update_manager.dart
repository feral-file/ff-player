import 'dart:async';

import 'package:feralfile_display_tizen/app_router.dart';
import 'package:feralfile_display_tizen/service/navigation_service.dart';
import 'package:feralfile_display_tizen/service/remote_config_service.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:flutter/material.dart';

class UpdateManager {
  final RemoteConfigService _remoteConfigService;
  final NavigationService _navigationService;

  UpdateManager(this._remoteConfigService, this._navigationService);

  /// check for updates every 30 minutes
  static const int _interval = 30;

  Future<void> _checkForUpdates() async {
    final String currentHash = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.gitHash, '');
    // check for updates
    log.info('UpdateManager current hash: $currentHash');
    await _remoteConfigService.loadConfigs();
    final String newHash = _remoteConfigService.getConfig(
        ConfigGroup.tizen, ConfigKey.gitHash, '');
    log.info('UpdateManager new hash: $newHash');
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
      _navigationService.pushReplacementNamed(AppRouter.inAppWebViewScreen);
    }
  }

  void start() {
    Timer.periodic(const Duration(minutes: _interval), (timer) async {
      await _checkForUpdates();
    });
  }
}
