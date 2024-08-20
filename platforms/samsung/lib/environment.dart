import 'package:flutter_dotenv/flutter_dotenv.dart';

class Environment {
  static String get pubDocURL => dotenv.env['PUB_DOC_URL'] ?? '';
}
