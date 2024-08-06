import 'dart:async';
import 'dart:convert';

import 'package:feralfile_display_tizen/gateway/pubdoc_api.dart';
import 'package:feralfile_display_tizen/utils/log.dart';

abstract class RemoteConfigService {
  Future<void> loadConfigs();

  bool getBool(final ConfigGroup group, final ConfigKey key);

  T getConfig<T>(final ConfigGroup group, final ConfigKey key, T defaultValue);
}

class RemoteConfigServiceImpl implements RemoteConfigService {
  RemoteConfigServiceImpl(this._pubdocAPI);

  static const String keyRights = 'rights';
  final PubdocAPI _pubdocAPI;

  static const Map<String, dynamic> _defaults = <String, dynamic>{
    'exhibition': {
      'john_gerrard': {
        'contract_address': '0x9D57f2e1A8c864009ed0C980E2d31aa5EB42f820',
        'exhibition_id': '50fb6756-80a9-46e4-b70c-380c32dfcc77',
      }
    },
    'display_app_url': {
      'tizen': 'https://feralfile-display-prod.pages.dev/',
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

  @override
  bool getBool(final ConfigGroup group, final ConfigKey key) {
    if (_configs == null) {
      unawaited(loadConfigs());
      return _defaults[group.getString]![key.getString] as bool;
    } else {
      return _configs![group.getString]?[key.getString] as bool? ??
          _defaults[group.getString]?[key.getString] as bool? ??
          false;
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
}

enum ConfigGroup {
  exhibition,
  johnGerrard,
  displayAppUrl,
}

// ConfigGroup getString extension
extension ConfigGroupExtension on ConfigGroup {
  String get getString {
    switch (this) {
      case ConfigGroup.exhibition:
        return 'exhibition';
      case ConfigGroup.johnGerrard:
        return 'john_gerrard';
      case ConfigGroup.displayAppUrl:
        return 'display_app_url';
    }
  }
}

enum ConfigKey {
  johnGerrard,
  customNote,
  crawl,
  tizen,
}

// ConfigKey getString extension
extension ConfigKeyExtension on ConfigKey {
  String get getString {
    switch (this) {
      case ConfigKey.johnGerrard:
        return 'john_gerrard';
      case ConfigKey.customNote:
        return 'custom_notes';
      case ConfigKey.crawl:
        return 'crawl';
      case ConfigKey.tizen:
        return 'tizen';
    }
  }
}
