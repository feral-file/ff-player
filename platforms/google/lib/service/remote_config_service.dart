import 'dart:async';
import 'dart:convert';

import 'package:feralfile_display/gateway/pubdoc_api.dart';
import 'package:feralfile_display/utils/log.dart';

abstract class RemoteConfigService {
  Future<void> loadConfigs();

  T getConfig<T>(final ConfigGroup group, final ConfigKey key, T defaultValue);

  String? getString(final ConfigGroup group, final ConfigKey key);
}

class RemoteConfigServiceImpl implements RemoteConfigService {
  RemoteConfigServiceImpl(this._pubdocAPI);

  final PubdocAPI _pubdocAPI;

  static const Map<String, dynamic> _defaults = <String, dynamic>{
    'tizen': {
      'url': 'https://feralfile-display-prod.pages.dev?platform=tizen',
      'gitHash': '1434d96c8ce703c4ed6d1485e18a5296a406bcdb',
      'updateInterval': '30'
    }
  };

  static Map<String, dynamic>? _configs;

  @override
  Future<void> loadConfigs() async {
    try {
      final data = await _pubdocAPI.getConfigs();
      _configs = jsonDecode(data) as Map<String, dynamic>;
      log.info('RemoteConfigService: loadConfigs: $_configs');
    } catch (e) {
      log.info('RemoteConfigService: loadConfigs: $e');
    }
  }

  T _getConfig<T>(Map<String, dynamic> config, final ConfigGroup group,
      final ConfigKey key, T defaultValue) {
    final hasKey = (config.keys.contains(group.getString)) &&
        (config[group.getString] as Map<String, dynamic>)
            .keys
            .contains(key.getString);
    if (!hasKey) {
      return defaultValue;
    }
    final res = config[group.getString]?[key.getString] as T;
    return res;
  }

  @override
  T getConfig<T>(final ConfigGroup group, final ConfigKey key, T defaultValue) {
    if (_configs == null) {
      unawaited(loadConfigs());
      return _getConfig(_defaults, group, key, defaultValue);
    } else {
      return _getConfig(_configs!, group, key, defaultValue);
    }
  }

  @override
  String? getString(final ConfigGroup group, final ConfigKey key) {
    if (_configs == null) {
      unawaited(loadConfigs());
      _defaults[group.getString]?[key.getString] as String?;
    }

    return _configs?[group.getString]?[key.getString] as String?;
  }
}

enum ConfigGroup { tizen }

// ConfigGroup getString extension
extension ConfigGroupExtension on ConfigGroup {
  String get getString {
    switch (this) {
      case ConfigGroup.tizen:
        return 'tizen';
    }
  }
}

enum ConfigKey { url, gitHash, updateInterval }

// ConfigKey getString extension
extension ConfigKeyExtension on ConfigKey {
  String get getString {
    switch (this) {
      case ConfigKey.url:
        return 'url';
      case ConfigKey.gitHash:
        return 'gitHash';
      case ConfigKey.updateInterval:
        return 'updateInterval';
    }
  }
}
