# Rueda de letras para H5P: guía para administradores

La Rueda de letras (`H5P.AlphabetWheel`) es un tipo de contenido H5P: una pista por cada letra del alfabeto, el
alumno escribe la respuesta o pasa la letra a la siguiente ronda, y el juego corrige y pone nota, un punto por letra.
Esta guía explica cómo instalarla, quién puede hacerlo y cómo califica.

## Qué se descarga

Cada versión publicada en GitHub trae un `.h5p` de ejemplo por idioma (español, inglés, alemán, francés, italiano,
neerlandés, portugués de Brasil y sueco). Todos llevan dentro la misma librería: basta con subir uno para que la Rueda
de letras quede instalada en el sitio, en todos los idiomas.

El juego no necesita ninguna otra librería de H5P ni se conecta a ningún servicio externo. Pide el núcleo H5P 1.24 o
posterior y está probado con el 1.27 (Lumi Desktop) y el 1.28 (Moodle 4.5.11 o posterior, WordPress). Por eso también
se instala en sitios donde los tipos oficiales más recientes ya no entran, porque exigen el 1.28.

## Instalación

### Moodle™ 4.5 o posterior (actividad H5P del núcleo)

1. Como administrador, entrar en *Administración del sitio > H5P > Gestionar tipos de contenido H5P* (*Site
   administration > H5P > Manage H5P content types*).
2. En el formulario para subir tipos de contenido, elegir el `.h5p` y subirlo.
3. La Rueda de letras aparece en la lista de tipos instalados y en el banco de contenido.

También queda instalada si un administrador crea una actividad H5P con el `.h5p` de ejemplo.

Después, los docentes crean sus ruedas en el banco de contenido o en una actividad H5P, como cualquier otro tipo.

**Permisos.** Instalar o actualizar un tipo de contenido exige `moodle/h5p:updatelibraries`, que por defecto tienen
los gestores y los administradores. Los docentes con permiso de edición (`moodle/h5p:deploy`) pueden subir contenido
de tipos que ya estén instalados, pero no instalar tipos nuevos. Los dos permisos llevan el aviso de riesgo XSS de
Moodle, porque un tipo de contenido ejecuta su propio código: por eso la instalación la hace quien administra el sitio.

### Moodle desde la línea de órdenes

Para quien administra el servidor, `tools/moodle-install-library.php` (en el repositorio) instala la librería sin
crear contenido, por el mismo camino que el formulario de Moodle. Se ejecuta como el usuario del servidor web:

```
php moodle-install-library.php --package=alphabet-wheel-1.0.0-es.h5p --sums=SHA256SUMS
```

Comprueba antes el SHA-256 del paquete con el `SHA256SUMS` de la versión publicada, no hace nada si el sitio ya tiene
esa versión o una más nueva, y termina con un código distinto de 0 si algo falla (2 si la huella no coincide). Admite
`--moodle=<carpeta de config.php>` si Moodle no está en `/var/www/moodle`. Probado en Moodle 4.5 y 5.3.

### WordPress con el plugin H5P

1. En *Contenido H5P > Añadir nuevo* (*H5P Content > Add New*), elegir *Subir* (*Upload*), seleccionar el `.h5p`
   y crear el contenido.
2. Para que el alumno pueda retomar una partida al recargar, activar en los ajustes del plugin H5P el guardado del
   estado del contenido (*Save content state*): viene desactivado.

La primera vez, el plugin puede pedir permiso para conectarse al Hub de H5P. La Rueda de letras no lo necesita: se
puede rechazar y subir el `.h5p` igualmente.

### Lumi Desktop

Abrir el `.h5p`. Lumi instala el tipo de contenido y la rueda de ejemplo. Lumi Desktop no guarda las partidas a medias
de ningún contenido.

## Actualizar

Se sube el `.h5p` de la versión nueva por el mismo camino que la primera vez. Moodle y WordPress sustituyen la
librería si la versión es mayor, y las ruedas ya creadas siguen funcionando.

## Cómo califica en Moodle

- **Un punto por letra.** La puntuación máxima es el número de letras de la rueda. En el libro de calificaciones, la
  nota es la calificación máxima de la actividad multiplicada por las letras acertadas y dividida entre el total: con
  una actividad sobre 10, 18 aciertos de 27 dan 6,67.
- **Un intento por partida.** Cada partida terminada crea un intento. Las letras que quedan sin contestar (por tiempo o
  porque el alumno termina antes) no suman. El método de calificación de la actividad (mejor intento, media, primero,
  último) decide qué intento cuenta.
- **El informe de intentos** muestra cada letra con lo que escribió el alumno y las respuestas aceptadas.
- **No hay aprobado ni suspenso**, solo la puntuación.
- **Hay que probar como alumno** y con el seguimiento activado: Moodle no guarda notas de docentes ni administradores.

### Partidas a medias

Si el alumno recarga la página a mitad de partida, la retoma donde la dejó: con las mismas letras acertadas, falladas
y pasadas, y con el reloj en pausa. Depende del ajuste *Guardar el estado* de la actividad H5P
(`mod_h5pactivity | enablesavestate`), que viene activado, y se guarda cada pocos segundos. Al terminar una partida,
recargar empieza otra nueva.

## Opciones de cada rueda

En el editor, cada docente elige:

- las letras, con su pista, si la respuesta empieza por la letra o la contiene, y otras respuestas válidas;
- el tiempo límite, que el alumno puede pausar, o ninguno;
- el idioma de las respuestas, que decide qué letras nunca cuentan como otra (la Ñ en español, la Ä en alemán);
- si se ignoran las mayúsculas y las tildes, si se muestra la respuesta correcta tras un fallo, si hay sonidos y si
  se ofrecen *Volver a jugar* y *Ver las respuestas*.

## Privacidad y accesibilidad

El juego no usa servicios externos, ni cookies, ni seguimiento. Solo guarda en el navegador si el alumno ha
silenciado los sonidos. Las partidas y las notas las guarda la plataforma, como las de cualquier contenido H5P.

Se juega entero con el teclado, el lector de pantalla anuncia la letra, la pista y el resultado, ningún estado depende
solo del color y se adapta a pantallas de 320 px y al zoom del 200 %.

## Ayuda

Los fallos y las propuestas se recogen en las incidencias del repositorio,
<https://github.com/OksigeniaSL/h5p-oksigenia/issues>. Los problemas de seguridad, por la vía de `SECURITY.md`.

Moodle™ es una marca registrada de Moodle Pty Ltd en muchos países. H5P es una marca registrada de H5P Group.
