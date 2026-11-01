# The steps of a game for session.sh: what is pressed, and how long Orca gets to speak.
#
# @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
# @license   MIT
step "Tab to the fullscreen button, then to the first piece"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 2
step "Tab to the second piece, Enter: choose it"; xdotool key Tab; sleep 1; xdotool key Return; sleep 2
step "Tab past the third piece and two choices, to the times tables, Enter"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Return; sleep 4
step "Enter: one jump"; xdotool key Return; sleep 4
step "Tab, Enter: two jumps"; xdotool key Tab; sleep 1; xdotool key Return; sleep 8
step "Enter: next round"; xdotool key Return; sleep 4
step "done"
