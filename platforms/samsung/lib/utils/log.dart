//
//  SPDX-License-Identifier: BSD-2-Clause-Patent
//  Copyright © 2022 Bitmark. All rights reserved.
//  Use of this source code is governed by the BSD-2-Clause Plus Patent License
//  that can be found in the LICENSE file.
//

import 'dart:core';
import 'dart:io';

import 'package:feralfile_display_tizen/model/send_attactment.dart';
import 'package:feralfile_display_tizen/service/support_service.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:flutter/material.dart';
import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';
import 'package:synchronized/synchronized.dart' as synchronization;

final log = AuLog('App');
final apiLog = Logger('API');

class AuLog {
  String name;
  AuLog(this.name);
  void info(String message) {
    debugPrint(message);
  }
}

Future<File> getLogFile() async {
  final directory = (await getTemporaryDirectory()).path;
  const fileName = 'app.log';

  return _createLogFile('$directory/$fileName');
}

Future<File> _createLogFile(canonicalLogFileName) async =>
    File(canonicalLogFileName).create(recursive: true);

class FileLogger {
  static final _lock =
      synchronization.Lock(); // uses the “synchronized” package
  static late File _logFile;
  static const shrinkSize = 1024 * 896; // 1MB characters

  static Future initializeLogging() async {
    await shrinkLogFileIfNeeded();
  }

  static Future<File> shrinkLogFileIfNeeded() async {
    _logFile = await getLogFile();

    final current = await _logFile.readAsString();
    if (current.length > shrinkSize) {
      await _logFile.writeAsString(
          current.substring(current.length - shrinkSize),
          flush: true);
    }

    final text = '${DateTime.now()}: LOGGING STARTED\n';

    /// per its documentation, `writeAsString` “Opens the file, writes
    /// the string in the given encoding, and closes the file”
    await _logFile.writeAsString(text, mode: FileMode.append, flush: true);

    return _logFile;
  }

  static void setLogFile(File file) {
    _logFile = file;
  }

  static File get logFile => _logFile;

  static Future logRecord(LogRecord record) async {
    var text = '$record\n';
    debugPrint(text);
    return _lock.synchronized(() async {
      await _logFile.writeAsString('${record.time}: $text',
          mode: FileMode.append, flush: true);
    });
  }

  static Future<void> clear() async {
    await _logFile.writeAsString('');
  }

  static Future<void> sendLog() async {
    print('send log');
    final data = await _logFile.readAsString();
    final title = '${DateTime.now().millisecondsSinceEpoch}_app.log';
    final attachments = [SendAttachment(data: data, title: title)];
    try {
      await injector<SupportService>()
          .createIssue('Log', attachments, title: title);
    } catch (e) {
      log.info('error: $e');
    }
  }
}
