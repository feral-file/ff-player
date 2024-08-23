//
//  SPDX-License-Identifier: BSD-2-Clause-Patent
//  Copyright © 2022 Bitmark. All rights reserved.
//  Use of this source code is governed by the BSD-2-Clause Plus Patent License
//  that can be found in the LICENSE file.
//
import 'package:shared_preferences/shared_preferences.dart';

abstract class ConfigurationService {
  int getQuarterTurn();

  Future<void> setQuarterTurn(int quarterTurn);

  String getString(String key);

  Future<void> setString(String key, String value);

  List<String> getListString(String key);

  Future<void> setListString(String key, List<String> value);

  Future<void> appendListString(String key, List<String> value);

  Future<void> removeListString(String key, List<String> value);
}

class ConfigurationServiceImpl implements ConfigurationService {
  static const String keyQuarterTurn = 'quarter_turn';

  final SharedPreferences _preferences;

  ConfigurationServiceImpl(this._preferences);

  @override
  int getQuarterTurn() => _preferences.getInt(keyQuarterTurn) ?? 0;

  @override
  Future<void> setQuarterTurn(int quarterTurn) async {
    await _preferences.setInt(keyQuarterTurn, quarterTurn);
  }

  @override
  String getString(String key) => _preferences.getString(key) ?? '';

  @override
  Future<void> setString(String key, String value) async {
    await _preferences.setString(key, value);
  }

  @override
  List<String> getListString(String key) =>
      _preferences.getStringList(key) ?? [];

  @override
  Future<void> setListString(String key, List<String> value) async {
    await _preferences.setStringList(key, value);
  }

  @override
  Future<void> appendListString(String key, List<String> value) async {
    final list = getListString(key)..addAll(value);
    await setListString(key, list);
  }

  @override
  Future<void> removeListString(String key, List<String> value) async {
    final list = getListString(key)
      ..removeWhere((element) => value.contains(element));
    await setListString(key, list);
  }
}
