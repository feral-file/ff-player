// ignore_for_file: cascade_invocations

import 'package:dio/dio.dart';
import 'package:feralfile_display_tizen/environment.dart';
import 'package:feralfile_display_tizen/gateway/pubdoc_api.dart';
import 'package:feralfile_display_tizen/gateway/support_api.dart';
import 'package:feralfile_display_tizen/service/configuration_service.dart';
import 'package:feralfile_display_tizen/service/navigation_service.dart';
import 'package:feralfile_display_tizen/service/remote_config_service.dart';
import 'package:feralfile_display_tizen/service/support_service.dart';
import 'package:feralfile_display_tizen/utils/log.dart';
import 'package:feralfile_display_tizen/utils/logging_interceptor.dart';
import 'package:feralfile_display_tizen/utils/support_interceptor.dart';
// ignore: depend_on_referenced_packages
import 'package:get_it/get_it.dart';
import 'package:http/http.dart';
import 'package:logging/logging.dart';
import 'package:shared_preferences/shared_preferences.dart';

final injector = GetIt.instance;

Future<void> setup() async {
  await FileLogger.initializeLogging();

  Logger.root.level = Level.ALL; // defaults to Level.INFO
  Logger.root.onRecord.listen((record) {
    FileLogger.logRecord(record);
  });

  final baseDio = getBaseDio(); // Default a baseDio instance
  final sharedPreferences = await SharedPreferences.getInstance();

  // injector.registerLazySingleton<CacheManager>(() => AUImageCacheManage());
  injector.registerLazySingleton<ConfigurationService>(
      () => ConfigurationServiceImpl(sharedPreferences));
  injector.registerLazySingleton<PubdocAPI>(
      () => PubdocAPI(baseDio, baseUrl: Environment.pubDocURL));

  injector.registerLazySingleton<RemoteConfigService>(
      () => RemoteConfigServiceImpl(injector()));

  final supportDio = baseDio..interceptors.add(SupportInterceptor());
  injector.registerLazySingleton<SupportApi>(
      () => SupportApi(supportDio, baseUrl: Environment.supportURL));

  injector.registerLazySingleton<SupportService>(() => SupportService());

  injector.registerLazySingleton(() => Client());

  injector.registerLazySingleton(() => NavigationService());
}

Dio getBaseDio() {
  final baseDio = Dio();
  baseDio.interceptors.add(LoggingInterceptor());
  return baseDio;
}
