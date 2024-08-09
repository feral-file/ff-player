class AppStateMessageReceived {
  final String handler;
  final dynamic data;

  AppStateMessageReceived({
    required this.handler,
    required this.data,
  });

  factory AppStateMessageReceived.fromJson(Map<String, dynamic> json) =>
      AppStateMessageReceived(
        handler: json['handler'],
        data: json['data'],
      );
}
