import 'package:dio/dio.dart';
import 'package:retrofit/http.dart';

part 'support_api.g.dart';

@RestApi(baseUrl: "")
abstract class SupportApi {
  factory SupportApi(Dio dio, {String baseUrl}) = _SupportApi;
  @POST("/v1/issues/")
  Future<dynamic> createIssue(
    @Body() Map<String, Object> body,
    @Header('x-device-id') String deviceId,
  );
}
