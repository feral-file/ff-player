import 'package:feralfile_display/inapp_webview/inapp_webview.dart';
import 'package:feralfile_display/service/remote_config_service.dart';
import 'package:feralfile_display/utils/injector.dart';
import 'package:flutter/material.dart';
import 'package:page_transition/page_transition.dart';

class AppRouter {
  static const homePage = 'home_page';
  static const inAppWebViewScreen = 'in_app_web_view_screen';

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case inAppWebViewScreen:
      case homePage:
        final url = injector<RemoteConfigService>().getConfig(
            ConfigGroup.google,
            ConfigKey.url,
            'https://display.feralfile.com/?platform=google');
        final payload = InAppWebViewPayload(url, url);
        return PageTransition(
          type: PageTransitionType.fade,
          curve: Curves.easeIn,
          settings: settings,
          child: InAppWebViewPage(payload: payload),
        );

      default:
        throw Exception('Invalid route: ${settings.name}');
    }
  }
}
