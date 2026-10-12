# Juegos de Oksigenia para H5P

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-yellow)
[![Patrocinio](https://img.shields.io/badge/patrocinio-Oksigenia-00d4ff)](https://oksigenia.com/en/open-source#sponsor)

Juegos de palabras convertidos en tipos de contenido H5P. Cada alumno juega solo, el juego corrige y la nota llega al
libro de calificaciones: en Moodle™ cuenta como una actividad calificada, igual que cualquier otra actividad H5P.

[Read in English](README.md)

## Juegos

- **Rueda de letras** (`H5P.AlphabetWheel`): una pista por cada letra del alfabeto. El alumno escribe la respuesta o
  pasa la letra a la siguiente vuelta. Un punto por letra.

## Dónde funcionan

En cualquier plataforma con H5P: la actividad H5P de Moodle 4.5 o posterior, WordPress con el plugin de H5P y Lumi
Desktop. Los juegos no dependen del núcleo H5P 1.28, así que también se instalan en sitios con el núcleo 1.27.

Cada versión publicada trae un `.h5p` de ejemplo por idioma. Al subirlo, el juego queda instalado en el sitio. Para
eso hace falta un usuario con permiso para instalar tipos de contenido H5P (en Moodle, el permiso
`moodle/h5p:updatelibraries`).

## Accesibilidad

La partida entera se juega con el teclado. La letra, la pista y el resultado se anuncian al lector de pantalla, nada
depende solo del color, el temporizador se puede pausar y todo se ve bien a 320 px de ancho y con zoom al 200 %.

## Desarrollo

Una carpeta por librería H5P en `packages/` y, en `packages/shared/`, el código que comparten los juegos, que se
compila dentro de cada juego en vez de instalarse como una librería más. Cada juego se publica por separado, con una
etiqueta como `alphabet-wheel-v1.0.0` y sus `.h5p` de ejemplo. Hace falta Node 22 o posterior.

```
npm install
npm test             # pruebas unitarias
npm run typecheck    # tipos, a partir de los comentarios JSDoc
npm run dev          # el servidor de pruebas de H5P (h5p-cli) con todos los juegos y sus ejemplos
npm run e2e          # pruebas de extremo a extremo en un navegador contra ese servidor
npm run pack         # build/ con cada librería y dist/ con los .h5p de ejemplo
npm run lang         # language/*.json a partir de semantics.json y de los diccionarios de i18n/
```

Las mismas fuentes dan siempre el mismo `.h5p`, byte a byte.

## En la pizarra de clase

Los mismos juegos, para toda la clase a la vez y con el docente llevando la cuenta, están en
[Oksigenia Classtools](https://github.com/OksigeniaSL/moodle-local_oksigeniaclasstools), la pizarra de aula para
Moodle.

## Licencia

MIT. © 2026 Oksigenia SL.

H5P es una marca registrada de H5P Group. Moodle™ es una marca registrada de Moodle Pty Ltd en muchos países.
