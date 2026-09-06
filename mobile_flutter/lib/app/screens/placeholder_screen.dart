import 'package:flutter/material.dart';

import '../navigation/app_screen.dart';

/// A distinct, identity-revealing placeholder for one of the five primary
/// sections (Milestone 5, section 7) — no real data, no financial
/// calculations, no port of the Web UI. Its only job is to prove real
/// navigation is happening: each instance shows its own [AppScreen.label]
/// with a screen-specific [Key] so tests/automation can assert exactly
/// which screen is on-screen.
///
/// The Home placeholder additionally exposes a button that opens a plain
/// [AlertDialog] — this is the fixture used to verify "transient UI
/// consumes Back before in-app screen history" (section 3.A/8), since a
/// dialog shown via [showDialog] pushes onto the SAME root [Navigator] the
/// shell's `PopScope` sits inside, and Flutter's own back-button handling
/// already pops the topmost route (the dialog) before ever consulting a
/// `PopScope` further down the stack — no custom back-interception code is
/// needed for this to work correctly.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.screen});

  final AppScreen screen;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(screen.label)),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              screen.label,
              key: ValueKey('placeholder-title-${screen.name}'),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              'שלד ניווט — Milestone 5 (${screen.name})',
              key: ValueKey('placeholder-subtitle-${screen.name}'),
            ),
            if (screen == AppScreen.home) ...[
              const SizedBox(height: 24),
              IconButton(
                key: const ValueKey('home-info-button'),
                icon: const Icon(Icons.info_outline),
                tooltip: 'מידע',
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (dialogContext) => AlertDialog(
                    key: const ValueKey('home-info-dialog'),
                    title: const Text('מידע'),
                    content: const Text('חלונית לדוגמה — לבדיקת התנהגות Back'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(dialogContext).pop(),
                        child: const Text('סגור'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
