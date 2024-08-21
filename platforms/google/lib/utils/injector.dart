// ignore_for_file: cascade_invocations

import 'package:dio/dio.dart';
import 'package:feralfile_display/environment.dart';
import 'package:feralfile_display/gateway/pubdoc_api.dart';
import 'package:feralfile_display/service/configuration_service.dart';
import 'package:feralfile_display/service/navigation_service.dart';
import 'package:feralfile_display/service/remote_config_service.dart';
import 'package:feralfile_display/utils/logging_interceptor.dart';
// ignore: depend_on_referenced_packages
import 'package:get_it/get_it.dart';
import 'package:http/http.dart';
import 'package:shared_preferences/shared_preferences.dart';

final injector = GetIt.instance;

Future<void> setup() async {
  final dio = Dio(); // Default a dio instance
  dio.interceptors.add(LoggingInterceptor());
  final sharedPreferences = await SharedPreferences.getInstance();

  // injector.registerLazySingleton<CacheManager>(() => AUImageCacheManage());
  injector.registerLazySingleton<ConfigurationService>(
      () => ConfigurationServiceImpl(sharedPreferences));
  injector.registerLazySingleton<PubdocAPI>(
      () => PubdocAPI(dio, baseUrl: Environment.pubDocURL));

  injector.registerLazySingleton<RemoteConfigService>(
      () => RemoteConfigServiceImpl(injector()));

  injector.registerLazySingleton(() => Client());

  injector.registerLazySingleton(() => NavigationService());
}
