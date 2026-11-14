# The steps of the wheel with letter tiles for session.sh: the letter keys take the tiles, as a player with a keyboard
# and a screen reader would play it.
#
# @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
# @license   MIT
step "Tab to the fullscreen button, then to Start"; xdotool key Tab; sleep 1; xdotool key Tab; sleep 2
step "Enter: start, the focus on the first tile"; xdotool key Return; sleep 4
step "type a, b, e, j: four tiles in the word"; xdotool type --delay 700 abej; sleep 3
step "BackSpace: the j goes back"; xdotool key BackSpace; sleep 3
step "type j, a: the word complete, the focus on Check"; xdotool type --delay 700 ja; sleep 3
step "Enter: right, and the next letter"; xdotool key Return; sleep 5
step "type the letters of Bicicleta in another order, Enter: wrong"; xdotool type --delay 250 icicletab; sleep 2; xdotool key Return; sleep 5
step "Tab, Tab, Tab: the tiles of the next letter"; xdotool key Tab; sleep 1.5; xdotool key Tab; sleep 1.5; xdotool key Tab; sleep 2
step "done"
