class JsMessageReceived {
  final String id;
  final String handler;
  final dynamic data;

  JsMessageReceived({
    required this.id,
    required this.handler,
    required this.data,
  });

  factory JsMessageReceived.fromJson(Map<String, dynamic> json) =>
      JsMessageReceived(
        id: json['id'],
        handler: json['handler'],
        data: json['data'],
      );
}

class JsMessageSend {
  final String id;
  final bool ok;
  final dynamic data;
  final String? errorMessage;

  JsMessageSend({
    required this.id,
    required this.data,
    this.ok = true,
    this.errorMessage,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'ok': ok,
        'data': data,
        'errorMessage': errorMessage,
      };

  static JsMessageSend errorResponse(String id, String message) =>
      JsMessageSend(id: id, ok: false, errorMessage: message, data: null);

  @override
  String toString() => toJson().toString();
}
