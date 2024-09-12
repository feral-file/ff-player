// ignore_for_file: discarded_futures, cascade_invocations

import 'dart:async';
import 'dart:convert';

import 'package:feralfile_display_tizen/model/app_state_message.dart';
import 'package:feralfile_display_tizen/model/js_message.dart';
import 'package:feralfile_display_tizen/service/configuration_service.dart';
import 'package:feralfile_display_tizen/utils/config_manager.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_tizen/webview_flutter_tizen.dart';

class InAppWebViewPage extends StatefulWidget {
  final InAppWebViewPayload payload;

  const InAppWebViewPage({required this.payload, super.key});

  @override
  State<InAppWebViewPage> createState() => _InAppWebViewPageState();
}

class _InAppWebViewPageState extends State<InAppWebViewPage> {
  final WebViewController _webViewController = WebViewController();
  final FocusNode _focusNode = FocusNode();

  bool _isLoading = true;
  bool _isBackAble = false;

  static const _listAlwaysHandledKeys = [
    LogicalKeyboardKey.arrowLeft,
    LogicalKeyboardKey.arrowRight,
    LogicalKeyboardKey.arrowUp,
    LogicalKeyboardKey.arrowDown,
    LogicalKeyboardKey.enter,
    LogicalKeyboardKey.digit0,
    LogicalKeyboardKey.digit1,
    LogicalKeyboardKey.digit2,
    LogicalKeyboardKey.digit3,
    LogicalKeyboardKey.digit4,
    LogicalKeyboardKey.digit5,
    LogicalKeyboardKey.digit6,
    LogicalKeyboardKey.digit7,
    LogicalKeyboardKey.digit8,
    LogicalKeyboardKey.digit9,
  ];

  @override
  void initState() {
    super.initState();
    unawaited(WakelockPlus.enable());
    _initWebview();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        body: Focus(
          autofocus: true,
          focusNode: _focusNode,
          onKeyEvent: (node, event) {
            log.info(event.toString());

            if (event is KeyDownEvent) {
              unawaited(_webViewController.runJavaScriptReturningResult(
                  'KeyEvent.handlePlatformEvent("${event.logicalKey.keyId}_'
                  '${event.logicalKey.keyLabel}");'));
            }

            if (_listAlwaysHandledKeys.contains(event.logicalKey)) {
              log.info('KeyEventResult.handled');
              return KeyEventResult.handled;
            }

            if (_isBackAble &&
                event.logicalKey.keyId == LogicalKeyboardKey.escape.keyId) {
              if (event is KeyDownEvent) {
                unawaited(_webViewController.runJavaScriptReturningResult(
                    'KeyEvent.handlePlatformEvent("${event.logicalKey.keyId}_'
                    '${event.logicalKey.keyLabel}");'));
              }

              log.info('KeyEventResult.handled');
              return KeyEventResult.handled;
            }

            log.info('KeyEventResult.ignored');
            return KeyEventResult.ignored;
          },
          child: WebViewWidget(
            controller: _webViewController,
            key: Key(widget.payload.key),
          ),
        ),
      );

  void _initWebview() {
    final url = widget.payload.url;
    log.info('load url: $url');
    _addJavaScriptChannel();
    _addConfigHandler();

    _webViewController.tizenEnginePolicy = true;
    _webViewController.loadRequest(Uri.parse(url));

    _webViewController.setJavaScriptMode(JavaScriptMode.unrestricted);
    _webViewController.setBackgroundColor(Colors.black);
    _webViewController.setOnConsoleMessage((message) {
      log.info('console: ${message.message}');
    });
    _webViewController.setNavigationDelegate(NavigationDelegate(
      onPageFinished: (url) async {
        log.info('page finished: $url');
        setState(() {
          _isLoading = false;
        });
      },
    ));
  }

  void _addJavaScriptChannel() {
    _webViewController.addJavaScriptChannel('AppState',
        onMessageReceived: (message) {
      final appStateMessage =
          AppStateMessageReceived.fromJson(jsonDecode(message.message));
      log.info('app state handler: ${appStateMessage.handler}');
      log.info('app state data: ${appStateMessage.data}');

      switch (appStateMessage.handler) {
        case 'loading':
          {
            setState(() {
              _isLoading = true;
            });
            break;
          }

        case 'loaded':
          {
            log.info('loaded');
            setState(() {
              _isLoading = false;
            });
            break;
          }

        case 'backAbleChanged':
          {
            final isBackAble = appStateMessage.data as bool;
            _isBackAble = isBackAble;
            break;
          }

        default:
      }
    });

    _webViewController.addJavaScriptChannel('Rotate',
        onMessageReceived: (message) {
      log.info('rotate: ${message.message}');
      final rotate = message.message;
      ConfigManager.instance.quarterTurns.value +=
          rotate == 'clockwise' ? 1 : -1;
    });

    _webViewController.addJavaScriptChannel('Log',
        onMessageReceived: (message) async {
      log.info('Log: ${message.message}');
      final json = jsonDecode(message.message);
      final String userId = json['data'] ?? 'unknown_user_${DateTime.now()}';
      await FileLogger.sendLog(userId: userId);
    });
  }

  void _addConfigHandler() {
    final config = injector<ConfigurationService>();
    _webViewController.addJavaScriptChannel('ConfigService',
        onMessageReceived: (message) async {
      log.info('configService: ${message.message}');
      late JsMessageSend response;
      try {
        final jsMessage =
            JsMessageReceived.fromJson(jsonDecode(message.message));
        final handler = jsMessage.handler;
        final id = jsMessage.id;
        final receivedData = jsMessage.data;
        final key = receivedData['key'];
        switch (handler) {
          case 'getString':
            final value = config.getString(key);
            response = JsMessageSend(id: id, data: value);

          case 'setString':
            final value = receivedData['value'] as String;
            await config.setString(key, value);
            response = JsMessageSend(id: id, data: null);

          case 'getListString':
            final value = config.getListString(key);
            response = JsMessageSend(id: id, data: value);

          case 'setListString':
            final value = receivedData['value'] as List<String>;
            await config.setListString(key, value);
            response = JsMessageSend(id: id, data: null);

          case 'appendListString':
            final value = receivedData['value'] as List<String>;
            await config.appendListString(key, value);
            response = JsMessageSend(id: id, data: null);

          case 'removeListString':
            final value = receivedData['value'] as List<String>;
            await config.removeListString(key, value);
            response = JsMessageSend(id: id, data: null);

          default:
            response = JsMessageSend.errorResponse(id, 'Unknown handler');
        }
        final responseString = jsonEncode(response.toJson());
        final rawString = responseString.replaceAll('"', r'\"');
        log.info('response: $response');
        log.info('''
          Config.handlePlatformEvent("$rawString");
        ''');
        await _webViewController.runJavaScript('''
              Config.handlePlatformEvent("$rawString");
            ''');
      } catch (e) {
        log.info('error: $e');
      }
    });
  }
}

class InAppWebViewPayload {
  final String url;
  final String key;

  InAppWebViewPayload(this.url, this.key);
}
