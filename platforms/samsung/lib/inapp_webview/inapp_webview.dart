// ignore_for_file: discarded_futures, cascade_invocations

import 'dart:async';
import 'dart:convert';

import 'package:device_info_plus_tizen/device_info_plus_tizen.dart';
import 'package:feralfile_display_tizen/model/js_message.dart';
import 'package:feralfile_display_tizen/service/configuration_service.dart';
import 'package:feralfile_display_tizen/utils/config_manager.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:feralfile_display_tizen/view/common_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

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

  @override
  void initState() {
    super.initState();
    unawaited(WakelockPlus.enable());
    _initWebview();
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(
        body: Focus(
          focusNode: _focusNode,
          onKeyEvent: (node, event) {
            if (event is KeyDownEvent) {
              log.info(
                  'key down: ${event.logicalKey.keyId} '
                      '${event.logicalKey.keyLabel}');
              event.logicalKey.toString();
              unawaited(_webViewController.runJavaScript(
                  'KeyEvent.handlePlatformEvent("${event.logicalKey.keyId}_'
                      '${event.logicalKey.keyLabel}");'));
              return KeyEventResult.handled;
            }
            return KeyEventResult.ignored;
          },
          child: Stack(
            children: [
              WebViewWidget(
                controller: _webViewController,
                key: Key(widget.payload.key),
              ),
              if (_isLoading) loadingWidget(context),
            ],
          ),
        ),
      );

  void _initWebview() {
    final url = widget.payload.url;
    log.info('load url: $url');
    _addJavaScriptChannel();
    _addConfigHandler();
    _webViewController.setUserAgent('tizen_webview');

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
        unawaited(_setDeviceName());
      },
    ));
  }

  Future<void> _setDeviceName() async {
    DeviceInfoPluginTizen deviceInfo = DeviceInfoPluginTizen();
    TizenDeviceInfo tizenInfo = await deviceInfo.tizenInfo;
    final name = tizenInfo.modelName ?? 'Samsung TV';
    await Future.delayed(const Duration(seconds: 2), () async {
      await _webViewController.runJavaScript('''
        DeviceName.handlePlatformEvent("$name");
      ''');
    });
  }

  void _addJavaScriptChannel() {
    _webViewController.addJavaScriptChannel('AppState',
        onMessageReceived: (message) {
          log.info('app state: ${message.message}');
          if (message.message == 'loading') {
            setState(() {
              _isLoading = true;
            });
          } else if (message.message == 'loaded') {
            log.info('loaded');
            setState(() {
              _isLoading = false;
            });
          }
        });
    _webViewController.addJavaScriptChannel('Rotate',
        onMessageReceived: (message) {
          log.info('rotate: ${message.message}');
          final rotate = message.message;
          ConfigManager.instance.quarterTurns.value +=
          rotate == 'clockwise' ? 1 : -1;
        });
  }

  Future<void> _addConfigHandler() async {
    final config = injector<ConfigurationService>();
    await _webViewController.addJavaScriptChannel('Config',
        onMessageReceived: (message) async {
          log.info('config: ${message.message}');
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
            await _webViewController.runJavaScript('''
          Config.handlePlatformEvent('${jsonEncode(response)}');
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
