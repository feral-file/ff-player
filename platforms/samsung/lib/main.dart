// ignore_for_file: prefer_int_literals

import 'dart:async';
import 'dart:ui';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:device_info_plus_tizen/device_info_plus_tizen.dart';
import 'package:feralfile_display_tizen/app_router.dart';
import 'package:feralfile_display_tizen/service/configuration_service.dart';
import 'package:feralfile_display_tizen/service/navigation_service.dart';
import 'package:feralfile_display_tizen/service/remote_config_service.dart';
import 'package:feralfile_display_tizen/utils/config_manager.dart';
import 'package:feralfile_display_tizen/utils/injector.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

late StreamSubscription<ConnectivityResult> connectivitySubscription;
final Connectivity connectivity = Connectivity();

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

    DeviceInfoPluginTizen deviceInfo = DeviceInfoPluginTizen();
    TizenDeviceInfo tizenInfo = await deviceInfo.tizenInfo;
    final name = tizenInfo.modelName ?? 'Samsung TV';
    unawaited(injector<ConfigurationService>().setString('device_name', name));

    // Init logger
    // Logger.root.level = Level.INFO;
    // Logger.root.onRecord.listen((record) {
    //   print('${record.level.name}: ${record.time}: ${record.message}');
    // });

    await injector<RemoteConfigService>().loadConfigs();

    connectivitySubscription =
        connectivity.onConnectivityChanged.listen((result) async {
      final context = injector<NavigationService>().context;
      if (context?.mounted == true) {
        if (result == ConnectivityResult.none) {
          ScaffoldMessenger.of(context!).showSnackBar(
            const SnackBar(
              content: Text('No internet connection'),
              duration: Duration(days: 1),
            ),
          );
        } else {
          ScaffoldMessenger.of(context!).hideCurrentSnackBar();
        }
      }
    });
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
            navigatorKey: GlobalKey<NavigatorState>(),
            navigatorObservers: [
              routeObserver,
            ],
            initialRoute: AppRouter.inAppWebViewScreen,
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
