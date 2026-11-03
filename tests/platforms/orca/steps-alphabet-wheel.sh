# The steps of a game for session.sh: what is pressed, and how long Orca gets to speak.
#
# @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
# @license   MIT
step "Tab to the fullscreen button, then to Start"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 2
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
