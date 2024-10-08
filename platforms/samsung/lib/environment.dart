import 'package:flutter_dotenv/flutter_dotenv.dart';

class Environment {
  static String get pubDocURL => dotenv.env['PUB_DOC_URL'] ?? '';

  static String get supportURL => dotenv.env['SUPPORT_URL'] ?? '';

  static String get supportApiKey => dotenv.env['SUPPORT_API_KEY'] ?? '';
}
