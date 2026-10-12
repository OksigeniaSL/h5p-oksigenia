# Orca, Firefox ESR and a virtual screen, to read what a screen reader says while a game is played with the keyboard
# (tests/platforms/orca/run.sh). Nothing of the host's screen, sound or input is used.
#
# @copyright 2026 Oksigenia <dev@oksigenia.cc>
# @license   MIT
FROM debian:trixie-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      orca firefox-esr xvfb xdotool dbus dbus-x11 at-spi2-core speech-dispatcher espeak-ng \
      gsettings-desktop-schemas dconf-cli dconf-gsettings-backend fonts-dejavu-core locales \
 && sed -i 's/^# *es_ES.UTF-8/es_ES.UTF-8/' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/*
RUN useradd -m tester
USER tester
WORKDIR /home/tester
ENV LANG=es_ES.UTF-8 DISPLAY=:99
