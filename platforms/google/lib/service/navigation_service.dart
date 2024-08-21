//
//  SPDX-License-Identifier: BSD-2-Clause-Patent
//  Copyright © 2022 Bitmark. All rights reserved.
//  Use of this source code is governed by the BSD-2-Clause Plus Patent License
//  that can be found in the LICENSE file.
//
import 'dart:async';

import 'package:feralfile_display/app_router.dart';
import 'package:flutter/material.dart';

class NavigationService {
  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  BuildContext? get context => navigatorKey.currentContext;

  // pop
  void pop<T extends Object?>([T? result]) {
    Navigator.of(context!).pop<T>(result);
  }

  // popUntil
  void popUntil(String routeName) {
    Navigator.of(context!).popUntil(ModalRoute.withName(routeName));
  }

  RouteSettings? getCurrentSettings() {
    RouteSettings? currentSettings;
    navigatorKey.currentState?.popUntil((route) {
      currentSettings = route.settings;
      return true;
    });
    return currentSettings;
  }

  void pushNamedOrReplace(String routeName, {Object? arguments}) {
    final currentRouteName = getCurrentSettings()?.name ?? '';
    if (currentRouteName == AppRouter.homePage) {
      unawaited(
          Navigator.of(context!).pushNamed(routeName, arguments: arguments));
    } else {
      unawaited(Navigator.of(context!)
          .pushReplacementNamed(routeName, arguments: arguments));
    }
  }

  void showSnackBar(String message) {
    if (context == null) {
      return;
    }
    final scaffold = Scaffold.maybeOf(context!);
    if (scaffold == null) {
      return;
    }

    ScaffoldMessenger.of(context!).showSnackBar(SnackBar(
      content: Text(message),
    ));
  }

  void pushReplacementNamed(String routeName, {Object? arguments}) {
    if (context == null) {
      return;
    }
    unawaited(Navigator.of(context!)
        .pushReplacementNamed(routeName, arguments: arguments));
  }
}
