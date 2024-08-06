import 'package:feralfile_app_theme/feral_file_app_theme.dart';
import 'package:feralfile_display_tizen/main.dart';
import 'package:flutter/material.dart';

Widget loadingWidget(BuildContext context) {
  final theme = Theme.of(context);
  final logoHeight = minSize * 0.265;

  return Container(
    width: double.infinity,
    height: double.infinity,
    color: AppColor.primaryBlack,
    child: Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Image.asset(
            'assets/images/ff-loading.gif',
            height: logoHeight,
          ),
          SizedBox(height: minSize * 0.05),
          Text(
            'Loading',
            style: theme.textTheme.ppMori400White16
                .copyWith(fontSize: minSize * 0.03),
          )
        ],
      ),
    ),
  );
}
