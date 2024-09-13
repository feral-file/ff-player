class LogData {
  final String userId;
  final String logTitle;
  final Map<String, String> metadata;
  final List<String> tags;

  LogData({
    required this.userId,
    required this.logTitle,
    required this.metadata,
    required this.tags,
  });

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'logTitle': logTitle,
        'metadata': metadata,
        'tags': tags,
      };

  factory LogData.fromJson(Map<String, dynamic> json) => LogData(
        userId: json['userId'] as String,
        logTitle: json['logTitle'] as String,
        metadata: json['metadata'] as Map<String, String>,
        tags: json['tags'] as List<String>,
      );
}
