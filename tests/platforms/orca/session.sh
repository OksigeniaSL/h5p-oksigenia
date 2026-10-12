#!/bin/sh
# Inside the container: a virtual screen, the accessibility bus, Orca writing what it says to /out/orca.log, and
# Firefox playing the wheel at $URL with the keyboard only (xdotool). The steps are printed as they go.
#
# @copyright 2026 Oksigenia <dev@oksigenia.cc>
# @license   MIT
set -eu
Xvfb :99 -screen 0 1280x900x24 >/dev/null 2>&1 &
sleep 1
eval "$(dbus-launch --sh-syntax)"
export GNOME_ACCESSIBILITY=1 GTK_MODULES=gail:atk-bridge MOZ_ENABLE_WAYLAND=0
# Firefox cannot build its sandbox inside an unprivileged container; this one is thrown away after the test.
export MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_GMP_SANDBOX=1 MOZ_DISABLE_RDD_SANDBOX=1 MOZ_DISABLE_SOCKET_PROCESS_SANDBOX=1
dconf write /org/gnome/desktop/a11y/applications/screen-reader-enabled true || true
/usr/libexec/at-spi-bus-launcher --launch-immediately >/dev/null 2>&1 &
sleep 1
orca --replace --debug-file=/out/orca.log >/dev/null 2>&1 &
sleep 4
firefox-esr --kiosk --new-instance --profile "$(mktemp -d)" "$URL" >/dev/null 2>&1 &
sleep 12
# Each step notes how long Orca's log is before it, so what Orca said can be cut out step by step.
step() { echo "$(wc -c < /out/orca.log)	$*" >> /out/steps.log; echo "STEP $*"; }
win=$(xdotool search --sync --onlyvisible --class firefox | head -1)
xdotool windowfocus --sync "$win" || true
xdotool mousemove 5 450 click 1
step "Tab to the first control"; xdotool key Tab; sleep 2
step "Enter: start"; xdotool key Return; sleep 3
step "type abeja, Enter (right)"; xdotool type --delay 60 abeja; xdotool key Return; sleep 3
step "type bote, Enter (wrong)"; xdotool type --delay 60 bote; xdotool key Return; sleep 4
step "Tab, Tab to Pass, Enter"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Return; sleep 4
step "Shift+Tab to the speaker button"; xdotool key shift+Tab; sleep 2
step "Shift+Tab to Pause, Enter"; xdotool key shift+Tab; sleep 1; xdotool key Return; sleep 3
step "Enter again: resume"; xdotool key Return; sleep 3
step "Tab to Check, Pass, Finish"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 2
step "Enter: finish asks"; xdotool key Return; sleep 3
step "Enter again: finish"; xdotool key Return; sleep 5
step "done"
