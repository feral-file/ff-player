import 'package:dio/dio.dart';
import 'package:feralfile_display_tizen/environment.dart';

class SupportInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.headers['x-api-key'] == null &&
        options.method.toUpperCase() == 'POST') {
      options.headers['x-api-key'] = Environment.supportApiKey;
    }
    handler.next(options);
  }
}
