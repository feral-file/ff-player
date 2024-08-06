
import 'package:feralfile_display_tizen/service/configuration_service.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:flutter/material.dart';

class ConfigManager {
  final ValueNotifier<int> _quarterTurns;

  // singleton
  ConfigManager._privateConstructor()
      : _quarterTurns =
            ValueNotifier(injector<ConfigurationService>().getQuarterTurn());
  static final ConfigManager _instance = ConfigManager._privateConstructor();
  static ConfigManager get instance => _instance;

  ValueNotifier<int> get quarterTurns => _quarterTurns;

  bool get isPortrait => quarterTurns.value % 2 == 1;
}
