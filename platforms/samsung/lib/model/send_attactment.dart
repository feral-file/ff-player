class SendAttachment {
  String data;
  String title;

  String contentType;

  SendAttachment({
    required this.data,
    required this.title,
    this.contentType = '',
  });

  factory SendAttachment.fromJson(Map<String, dynamic> json) => SendAttachment(
        data: json['data'],
        title: json['title'],
        contentType: json['content_type'],
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'data': data,
        'title': title,
        'content_type': contentType,
      };
}
