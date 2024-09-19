import 'package:feralfile_display/gateway/support_api.dart';
import 'package:feralfile_display/model/send_attactment.dart';
import 'package:feralfile_display/utils/injector.dart';
import 'package:feralfile_display/utils/log.dart';

class SupportService {
  static final SupportService _instance = SupportService._internal();

  factory SupportService() => _instance;

  SupportService._internal();

  final supportApi = injector<SupportApi>();

  Future<dynamic> createIssue(
    String? message,
    List<SendAttachment>? attachments,
    String userId, {
    String? title,
    List<String>? mutedText,
    String? announcementID,
    List<String> tags = const [],
  }) async {
    var issueTitle = title ?? message;
    if (issueTitle == null || issueTitle.isEmpty) {
      issueTitle = attachments?.first.title ?? 'Unnamed';
    }

    // add tags
    var customTags = [...tags, 'Android TV'];

    final submitMessage = message ?? '';

    final payload = {
      'attachments': attachments ?? [],
      'title': issueTitle,
      'message': submitMessage,
      'tags': customTags,
      'announcement_context_id': announcementID ?? '',
    };
    log.info('createIssue: $payload');

    return await supportApi.createIssue(payload, userId);
  }
}
