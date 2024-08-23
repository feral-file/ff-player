// ignore_for_file: prefer_int_literals

import 'dart:async';
import 'dart:ui';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:feralfile_display/app_router.dart';
import 'package:feralfile_display/service/configuration_service.dart';
import 'package:feralfile_display/service/navigation_service.dart';
import 'package:feralfile_display/service/remote_config_service.dart';
import 'package:feralfile_display/utils/config_manager.dart';
import 'package:feralfile_display/utils/injector.dart';
import 'package:feralfile_display/utils/log.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

double minSize = 0.0;
double defaultFontSize = 0.0;
double titleFontSize = 0.0;
double defaultPadding = 0.0;

Future<void> main() async {
  await runZonedGuarded(() async {
    await dotenv.load();

    WidgetsFlutterBinding.ensureInitialized();
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    await setup();

    await injector<RemoteConfigService>().loadConfigs();
    DeviceInfoPlugin deviceInfo = DeviceInfoPlugin();
    AndroidDeviceInfo info = await deviceInfo.androidInfo;
    final name = info.model;
    await injector<ConfigurationService>().setString('device_name', name);

    //UpdateManager(injector(), injector()).start();

    runApp(const MyApp());
  }, (Object error, StackTrace stackTrace) {
    if (kDebugMode) {
      print('Uncaught error: $error, $stackTrace');
    }
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    log.info('Started app');
    final width = MediaQuery.of(context).size.width;
    final height = MediaQuery.of(context).size.height;
    minSize = width > height ? height : width;
    defaultFontSize = minSize * 0.021;
    titleFontSize = defaultFontSize * 48 / 22;
    defaultPadding = minSize * 0.037;
    return Shortcuts(
      shortcuts: <LogicalKeySet, Intent>{
        LogicalKeySet(LogicalKeyboardKey.select): const ActivateIntent(),
      },
      child: ValueListenableBuilder<int>(
          valueListenable: ConfigManager.instance.quarterTurns,
          child: MaterialApp(
            scrollBehavior: NoThumbScrollBehavior().copyWith(scrollbars: false),
            title: 'Feral File',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              primarySwatch: Colors.blue,
            ),
            navigatorKey: injector<NavigationService>().navigatorKey,
            navigatorObservers: [
              routeObserver,
            ],
            initialRoute: AppRouter.homePage,
            onGenerateRoute: AppRouter.onGenerateRoute,
          ),
          builder: (context, value, child) => RotatedBox(
                quarterTurns: value,
                child: child,
              )),
    );
  }
}

class NoThumbScrollBehavior extends ScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.stylus,
      };
}

final RouteObserver<ModalRoute<void>> routeObserver =
    RouteObserver<ModalRoute<void>>();
