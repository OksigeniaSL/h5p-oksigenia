# The steps of a game for session.sh: what is pressed, and how long Orca gets to speak. The click that focuses the window
# lands below the row of scales, so the first Tab reaches the first topic. Sharing out never ends a round before every
# weight is on a pan, so what is said after one weight does not depend on the numbers that came out.
#
# @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
# @license   MIT
step "Tab: the first topic"; xdotool key Tab; sleep 3
step "Shift+Tab three times: back over the three scales"; xdotool key shift+Tab; sleep 2; xdotool key shift+Tab; sleep 2; xdotool key shift+Tab; sleep 3
step "Tab five times to the third topic, Enter: sharing out"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 1; xdotool key Tab; sleep 2; xdotool key Return; sleep 5
step "Enter on the first weight: which side?"; xdotool key Return; sleep 3
step "Enter: on the left pan"; xdotool key Return; sleep 5
step "done"
