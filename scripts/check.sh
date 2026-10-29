#!/bin/sh
# dsh-mobile-use preflight: checks the device tooling this bundle needs.
set -u

echo "dsh-mobile-use preflight"
echo "------------------------"

echo "iOS simulators booted:"
xcrun simctl list devices booted 2>/dev/null | sed 's/^/  /' | head -8 || echo "  xcrun/simctl not available"

echo "iOS runtimes:"
xcrun simctl list runtimes 2>/dev/null | sed 's/^/  /' | head -5

if command -v adb >/dev/null 2>&1; then
  echo "Android devices:"
  adb devices 2>/dev/null | sed 's/^/  /'
else
  echo "Android: adb not found (optional)"
fi

echo
echo "Next: install this bundle with DSH Plugin Manager, reload the Web UI,"
echo "      then right Sidebar -> guide -> Simulator."
