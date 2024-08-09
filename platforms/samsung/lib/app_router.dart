import 'package:feralfile_display_tizen/inapp_webview/inapp_webview.dart';
import 'package:feralfile_display_tizen/service/remote_config_service.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:flutter/material.dart';
import 'package:page_transition/page_transition.dart';

class AppRouter {
  static const homePage = 'home_page';
  static const inAppWebViewScreen = 'in_app_web_view_screen';

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case inAppWebViewScreen:
      case homePage:
        final isRefresh = settings.arguments as bool? ?? false;
        String url = injector<RemoteConfigService>().getConfig(
            ConfigGroup.tizen,
            ConfigKey.url,
            'https://feralfile-display-prod.pages.dev/');
        if (isRefresh) {
          if (url.contains('?')) {
            url = '$url&refresh=true';
          } else {
            url = '$url?refresh=true';
          }
        }
        final gitHash = injector<RemoteConfigService>()
            .getConfig(ConfigGroup.tizen, ConfigKey.gitHash, '');
        final payload = InAppWebViewPayload(url, '${url}_$gitHash');
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
