import 'package:feralfile_display_tizen/gateway/support_api.dart';
import 'package:feralfile_display_tizen/model/send_attactment.dart';
import 'package:feralfile_display_tizen/utils/injectorvice _instance = SupportService._internal();

  factory SupportService() => _instance;

  SupportService._internal();

  final supportApi = injector<SupportApi>();

  Future<dynamic> createIssue(
    String? message,
    List<SendAttachment>? attachments, {
    String? title,
    List<String>? mutedText,
    String? announcementID,
  }) async {
    var issueTitle = title ?? message;
    if (issueTitle == null || issueTitle.isEmpty) {
      issueTitle = attachments?.first.title ?? 'Unnamed';
    }

    // add tags
    var tags = ['Tizen'];

    final submitMessage = message ?? '';

    final payload = {
      'attachments': attachments ?? [],
      'title': issueTitle,
      'message': submitMessage,
      'tags': tags,
      'announcement_context_id': announcementID ?? '',
    };

    return await supportApi.createIssue(payload);
  }
}
